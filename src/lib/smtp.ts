import { randomUUID } from 'node:crypto';
import tls from 'node:tls';
import type { Duplex } from 'node:stream';

/**
 * Minimal SMTP client (implicit TLS, AUTH PLAIN) for sending alerts from our own mailbox, e.g. Google
 * Workspace via smtp.gmail.com:465 with an app password. Uses only node:tls, which works in Node and on
 * Cloudflare Workers (nodejs_compat); full mail libraries such as nodemailer do not run on Workers.
 */
export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export interface MailMessage {
  /** "Name <address>" or a bare address. */
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
}

export class SmtpError extends Error {}

/** Address part of "Name <a@b.c>" (or the input itself). */
export const addressOf = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim();

/** RFC 2047 encoded-word for headers containing non-ASCII (e.g. the "·" in subjects). */
function encodeHeader(s: string) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}

function encodeFrom(from: string) {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m && m[1] ? `${encodeHeader(m[1].replace(/^"|"$/g, ''))} <${m[2]}>` : addressOf(from);
}

const base64Lines = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');

/** Full RFC 5322 message: multipart/alternative with a plain-text and an HTML part, CRLF line endings. */
export function buildMime(msg: MailMessage, now = new Date()) {
  const boundary = `=_florzy_${randomUUID()}`;
  const domain = addressOf(msg.from).split('@')[1] ?? 'localhost';
  const lines = [
    `From: ${encodeFrom(msg.from)}`,
    `To: ${msg.to.join(', ')}`,
    `Subject: ${encodeHeader(msg.subject)}`,
    `Date: ${now.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(msg.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(msg.html),
    `--${boundary}--`,
    '',
  ];
  return lines.join('\r\n');
}

/** Reads SMTP replies; a reply ends at the line "NNN text" (a dash after the code means more lines follow). */
function replyReader(socket: Duplex, timeoutMs: number) {
  let buf = '';
  let waiter: ((err?: Error) => void) | null = null;
  let failure: Error | null = null;
  const wake = (err?: Error) => {
    const w = waiter;
    waiter = null;
    w?.(err);
  };
  socket.on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    wake();
  });
  socket.on('error', (err: Error) => {
    failure = err;
    wake(err);
  });
  socket.on('close', () => {
    failure ??= new SmtpError('Mail server closed the connection');
    wake(failure);
  });

  return async function read(): Promise<{ code: number; text: string }> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const lines = buf.split('\r\n');
      const end = lines.findIndex((l) => /^\d{3}( |$)/.test(l));
      if (end !== -1) {
        buf = lines.slice(end + 1).join('\r\n');
        const reply = lines.slice(0, end + 1);
        return { code: Number(reply[end].slice(0, 3)), text: reply.map((l) => l.slice(4)).join(' ') };
      }
      if (failure) throw failure;
      const left = deadline - Date.now();
      if (left <= 0) throw new SmtpError('Mail server did not answer in time');
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => wake(new SmtpError('Mail server did not answer in time')), left);
        waiter = (err) => {
          clearTimeout(t);
          if (err) reject(err);
          else resolve();
        };
      });
    }
  };
}

export type Connect = (cfg: SmtpConfig) => Duplex;
const tlsConnect: Connect = (cfg) => tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host });

/** Sends one message. Throws SmtpError with the server's reply when the server refuses a step. */
export async function sendMail(cfg: SmtpConfig, msg: MailMessage, connect: Connect = tlsConnect, timeoutMs = 20_000) {
  const socket = connect(cfg);
  const read = replyReader(socket, timeoutMs);
  const step = async (line: string | null, expect: number[], what: string) => {
    if (line !== null) socket.write(`${line}\r\n`);
    const r = await read();
    if (!expect.includes(r.code)) throw new SmtpError(`${what} refused: ${r.code} ${r.text}`);
    return r;
  };

  try {
    await step(null, [220], 'Connection');
    await step('EHLO florzy-critical-cases', [250], 'EHLO');
    await step(`AUTH PLAIN ${Buffer.from(`\0${cfg.user}\0${cfg.pass}`, 'utf8').toString('base64')}`, [235], 'Login');
    await step(`MAIL FROM:<${addressOf(msg.from)}>`, [250], 'Sender');
    for (const to of msg.to) await step(`RCPT TO:<${to}>`, [250, 251], `Recipient ${to}`);
    await step('DATA', [354], 'DATA');
    // Dot-stuffing: a line starting with "." gets an extra "." so it isn't read as end-of-message.
    const body = buildMime(msg).replace(/^\./gm, '..');
    await step(`${body}\r\n.`, [250], 'Message');
    socket.write('QUIT\r\n');
  } finally {
    socket.end();
  }
}

/**
 * SMTP settings from the environment. null when not configured (alerts are then skipped).
 * Defaults to Google (smtp.gmail.com:465), which Florzy's mailboxes use.
 */
export function smtpFromEnv(env: Record<string, string | undefined> = process.env): { cfg: SmtpConfig; from: string } | null {
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS?.replace(/\s+/g, ''); // Google shows app passwords as "abcd efgh ijkl mnop"
  if (!user || !pass) return null;
  return {
    cfg: { host: env.SMTP_HOST?.trim() || 'smtp.gmail.com', port: Number(env.SMTP_PORT) || 465, user, pass },
    from: env.EMAIL_FROM?.trim() || `Florzy Critical Cases <${user}>`,
  };
}
