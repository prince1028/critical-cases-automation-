import assert from 'node:assert/strict';
import net from 'node:net';
import { test } from 'node:test';
import { addressOf, buildMime, sendMail, SmtpError, smtpFromEnv, type SmtpConfig } from './smtp';

const msg = {
  from: 'Florzy Critical Cases <alerts@florzy.com>',
  to: ['a@x.com', 'b@y.in'],
  subject: 'CC-120: Insufficient Stock · 6716',
  text: 'Line one\n.starts with a dot',
  html: '<p>Hi</p>',
};

/** Fake SMTP server: records what the client sends; `refuse` maps a command prefix to an error reply. */
async function fakeServer(refuse: Record<string, string> = {}) {
  const seen: string[] = [];
  let data = '';
  const server = net.createServer((s) => {
    let inData = false;
    let buf = '';
    s.write('220 fake ready\r\n');
    s.on('data', (chunk) => {
      buf += chunk.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            s.write('250 queued\r\n');
          } else data += `${line}\n`;
          continue;
        }
        seen.push(line);
        const bad = Object.entries(refuse).find(([k]) => line.startsWith(k));
        if (bad) s.write(`${bad[1]}\r\n`);
        else if (line.startsWith('EHLO')) s.write('250-fake\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
        else if (line.startsWith('AUTH')) s.write('235 accepted\r\n');
        else if (line === 'DATA') {
          inData = true;
          s.write('354 go\r\n');
        } else if (line === 'QUIT') s.end('221 bye\r\n');
        else s.write('250 OK\r\n');
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as net.AddressInfo).port;
  const cfg: SmtpConfig = { host: '127.0.0.1', port, user: 'alerts@florzy.com', pass: 'secret' };
  const connect = () => net.connect(port, '127.0.0.1');
  return { cfg, connect, seen, data: () => data, close: () => new Promise((r) => server.close(r)) };
}

test('sends login, sender, every recipient and the message', async () => {
  const srv = await fakeServer();
  try {
    await sendMail(srv.cfg, msg, srv.connect);
    assert.equal(srv.seen[0], 'EHLO florzy-critical-cases');
    assert.equal(srv.seen[1], `AUTH PLAIN ${Buffer.from('\0alerts@florzy.com\0secret').toString('base64')}`);
    assert.deepEqual(srv.seen.slice(2, 5), ['MAIL FROM:<alerts@florzy.com>', 'RCPT TO:<a@x.com>', 'RCPT TO:<b@y.in>']);
    assert.ok(srv.data().includes('To: a@x.com, b@y.in'));
    assert.ok(srv.data().includes('Subject: =?UTF-8?B?'));
  } finally {
    await srv.close();
  }
});

test('a refused login surfaces the server reply', async () => {
  const srv = await fakeServer({ AUTH: '535 5.7.8 Username and Password not accepted' });
  try {
    await assert.rejects(sendMail(srv.cfg, msg, srv.connect), (e: Error) => e instanceof SmtpError && /Login refused: 535/.test(e.message));
  } finally {
    await srv.close();
  }
});

test('a refused recipient fails the send', async () => {
  const srv = await fakeServer({ 'RCPT TO:<b@y.in>': '550 no such user' });
  try {
    await assert.rejects(sendMail(srv.cfg, msg, srv.connect), /Recipient b@y.in refused: 550/);
  } finally {
    await srv.close();
  }
});

test('MIME message: both parts, decodable, CRLF', () => {
  const m = buildMime(msg);
  assert.ok(m.includes('Content-Type: multipart/alternative'));
  assert.ok(m.includes('Content-Type: text/plain; charset=utf-8') && m.includes('Content-Type: text/html; charset=utf-8'));
  assert.ok(!/[^\r]\n/.test(m), 'all line endings are CRLF');
  const parts = [...m.matchAll(/base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g)].map((x) => Buffer.from(x[1].replace(/\r\n/g, ''), 'base64').toString());
  assert.deepEqual(parts, [msg.text, msg.html]);
  assert.ok(m.split('\r\n').every((l) => l.length <= 998), 'no over-long lines');
});

test('settings from env', () => {
  assert.equal(smtpFromEnv({}), null);
  assert.equal(smtpFromEnv({ SMTP_USER: 'p@florzy.com' }), null);
  assert.deepEqual(smtpFromEnv({ SMTP_USER: 'p@florzy.com', SMTP_PASS: 'abcd efgh ijkl mnop' }), {
    cfg: { host: 'smtp.gmail.com', port: 465, user: 'p@florzy.com', pass: 'abcdefghijklmnop' },
    from: 'Florzy Critical Cases <p@florzy.com>',
  });
  assert.equal(addressOf('Name <x@y.z>'), 'x@y.z');
});
