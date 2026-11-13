/**
 * WhatsApp chat export parser (read-only ingestion layer for the analytics MVP).
 *
 * Reads the .txt file WhatsApp produces from "Export chat" (with or without media) and turns it into
 * typed messages. Pure and framework-free so it can be unit tested; the database write lives in
 * src/server/whatsapp-import.ts.
 *
 * Supported line shapes (both platforms, 2-digit and 4-digit years):
 *
 *   [14/09/2026, 10:32:11] Alice: out of stock for 1049        (Android)
 *   14/09/2026, 10:32 - Alice: out of stock for 1049           (iOS)
 *   14/09/2026, 10:32 - Messages and calls are end-to-end encrypted...   (system notice, dropped)
 *   <invisible RTL marks>14/09/2026, 10:32 - Alice: hello
 *
 * A line without a timestamp continues the previous message, exactly as WhatsApp wraps long messages.
 * A "<Media omitted>" line keeps its placeholder in the text so the case reads like the original
 * report; it carries no critical signal, so it is not treated as a case.
 */

export interface WaMessage {
  /** Message date in India, yyyy-mm-dd. This is the analytics date of the case. */
  reportedOn: string;
  /** Local wall-clock time as written in the export, "hh:mm". */
  time: string;
  sender: string;
  text: string;
  /** Position in the export, used only to point at an unparsed line. Never stored as an identity. */
  line: number;
}

/** `[dd/mm/yyyy, hh:mm:ss] Sender: text` or `dd/mm/yyyy, hh:mm - Sender: text`. */
const BRACKET = /^\[(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*([\s\S]*)$/;
const DASH = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*-\s*([\s\S]*)$/;

/** WhatsApp's own system lines: the encryption banner, deletions, media placeholders. */
const SYSTEM = /^(messages and calls are end-to-end encrypted|you deleted this message|this message was deleted)/i;
/** Invisible marks WhatsApp puts in front of RTL lines (LRI, RLI, PDI, LRM, RLM, FSI, PDI). */
const INVISIBLE = /[\u200E\u200F\u061C\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

const two = (v: string) => v.padStart(2, '0');

/** WhatsApp writes the local wall-clock time without a zone; the business runs on IST. */
export function waDateToYmd(d: string, m: string, y: string): string | null {
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  const day = Number(d);
  const month = Number(m);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${two(String(month))}-${two(String(day))}`;
}

export interface ParsedExport {
  messages: WaMessage[];
  /** Lines that were not a message and had no message above them to attach to. */
  unparsedLines: number;
  /** System notices and encryption banners that were skipped on purpose. */
  systemLines: number;
}

/**
 * Splits an export into messages. Never throws: a line it cannot read becomes a continuation of the
 * message above it, which is how WhatsApp itself wraps long messages.
 */
export function parseWhatsAppExport(text: string): ParsedExport {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const messages: WaMessage[] = [];
  let unparsedLines = 0;
  let systemLines = 0;

  for (const [i, raw] of lines.entries()) {
    const line = raw.replace(INVISIBLE, '').replace(/\s+$/, '');
    if (!line.trim()) continue;

    const trimmed = line.replace(/^\s+/, '');
    const m = BRACKET.exec(trimmed) ?? DASH.exec(trimmed);
    if (!m) {
      const last = messages[messages.length - 1];
      if (last) last.text = `${last.text}\n${line.trim()}`;
      else unparsedLines++;
      continue;
    }

    const reportedOn = waDateToYmd(m[1], m[2], m[3]);
    if (!reportedOn) {
      unparsedLines++;
      continue;
    }
    const time = `${two(m[4])}:${m[5]}`;
    const rest = (m[7] ?? '').trim();

    // "Sender: text". The separator is the first colon that has text after it, so a message
    // starting with a URL or a time is not cut in half.
    const cut = /:\s/.exec(rest);
    const sender = (cut ? rest.slice(0, cut.index) : rest).trim();
    const body = cut ? rest.slice(cut.index + 1).trimStart() : '';

    if (!sender || SYSTEM.test(sender)) {
      systemLines++;
      continue;
    }

    messages.push({ reportedOn, time, sender, text: body || rest, line: i + 1 });
  }

  return { messages, unparsedLines, systemLines };
}

// ---------- Which messages are critical cases ----------

/** The phrases that mean "this message reports a problem with a tile". Same vocabulary the sheet import used. */
export const CRITICAL_SIGNALS = [
  'out of stock',
  'no stock',
  'stock out',
  'insufficient stock',
  'insufficient quantity',
  'not available',
  'unavailable',
  'color issue',
  'colour issue',
  'color mismatch',
  'colour mismatch',
  'wrong color',
  'wrong colour',
  'wrong shade',
  'shade variation',
  'batch difference',
  'size issue',
  'size mismatch',
  'finish issue',
  'quality issue',
  'quality problem',
  'damaged',
  'broken',
  'cracked',
  'defect',
  'defective',
  'wrong tile',
  'wrong item',
  'wrong quantity',
  'short supply',
  'delivery delay',
  'delayed delivery',
  'delay in delivery',
  'price issue',
  'pricing issue',
  'price increase',
  'alternative rejected',
  'customer rejected',
  'need urgent',
  'urgent requirement',
  'critical',
  'not matching',
] as const;

/** Chatter: an acknowledgement, never a case, however many numbers it contains. */
const ACKNOWLEDGEMENT =
  /^(ok|okay|kk|thanks|thank you|thx|ty|received|noted|done|done\b|sure|yes|no|yes\b|no\b|hi|hello|hey|good morning|good evening|👍|🙏|🙏|:)[\s!.,]*$/i;

/** True when the text reads like a critical-case report. */
export function hasCriticalSignal(text: string): boolean {
  const t = text.toLowerCase().replace(/\s+/g, ' ');
  return CRITICAL_SIGNALS.some((s) => t.includes(s));
}

export type SkipReason = 'acknowledgement' | 'no_signal' | 'empty';

export interface MessageVerdict {
  message: WaMessage;
  isCase: boolean;
  /** Why a message was not treated as a case. null when it was. */
  skipReason: SkipReason | null;
}

/**
 * Labels every message as a critical case or not. Anything the parser is unsure about is kept as a
 * case flagged for review rather than dropped.
 */
export function classifyMessages(messages: WaMessage[]): MessageVerdict[] {
  return messages.map((message) => {
    const flat = message.text.replace(/\s+/g, ' ').trim();
    if (!flat) return { message, isCase: false, skipReason: 'empty' as const };
    if (ACKNOWLEDGEMENT.test(flat)) return { message, isCase: false, skipReason: 'acknowledgement' as const };
    if (!hasCriticalSignal(flat)) return { message, isCase: false, skipReason: 'no_signal' as const };
    return { message, isCase: true, skipReason: null };
  });
}

/**
 * Deterministic identity of a WhatsApp message: message date + time + sender + text.
 * NOT the Excel row number, the array index or the upload time - the same export is re-uploaded
 * every couple of weeks, so this has to be stable across exports of overlapping history.
 */
export function messageFingerprint(m: WaMessage): string {
  return [m.reportedOn, m.time, m.sender, m.text.replace(/\s+/g, ' ').trim()].join('|');
}

/**
 * sha256 of the fingerprint, hex encoded: exactly what critical_cases.import_hash expects, and the
 * same digest the spreadsheet import writes, so both ingestion channels dedup through one column.
 * Web Crypto rather than node:crypto, so it also runs on Cloudflare Workers.
 */
export async function messageHash(m: WaMessage): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(messageFingerprint(m)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}