import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyMessages,
  hasCriticalSignal,
  messageFingerprint,
  messageHash,
  parseWhatsAppExport,
  waDateToYmd,
  type WaMessage,
} from './whatsapp';

const ANDROID = [
  '[14/09/2026, 10:32:11] Alice: out of stock for 1049',
  '[14/09/2026, 10:33:02] Bob: ok',
  '[15/09/2026, 09:01:44] Alice: 1049',
  'customer rejected the shade',
].join('\n');

const IOS = [
  '14/09/2026, 10:32 - Messages and calls are end-to-end encrypted.',
  '14/09/2026, 10:33 - Alice: out of stock for 1049',
  '14/09/2026, 10:34 - Alice: <Media omitted>',
].join('\n');

test('parses the Android export shape and wraps long messages', () => {
  const { messages } = parseWhatsAppExport(ANDROID);
  assert.equal(messages.length, 3);

  assert.deepEqual(messages[0], {
    reportedOn: '2026-09-14',
    time: '10:32',
    sender: 'Alice',
    text: 'out of stock for 1049',
    line: 1,
  });
  assert.deepEqual([messages[1].sender, messages[1].text], ['Bob', 'ok']);
  // The line without a timestamp continues the message above it, as WhatsApp wraps long text.
  assert.equal(messages[2].text, '1049\ncustomer rejected the shade');
});

test('parses the iOS shape and skips the encryption banner', () => {
  const { messages, systemLines } = parseWhatsAppExport(IOS);
  assert.equal(systemLines, 1);
  assert.deepEqual(
    messages.map((m) => [m.sender, m.text]),
    [
      ['Alice', 'out of stock for 1049'],
      // The placeholder stays, so the case still reads like the original report.
      ['Alice', '<Media omitted>'],
    ],
  );
  // ...and it carries no signal, so it never becomes a case.
  assert.deepEqual(
    classifyMessages(messages).map((v) => v.isCase),
    [true, false],
  );
});

test('strips the invisible RTL marks WhatsApp puts in front of some lines', () => {
  const { messages } = parseWhatsAppExport('‎14/09/2026, 10:32 - Alice: urgent requirement for 1049');
  assert.equal(messages[0].sender, 'Alice');
  assert.equal(messages[0].text, 'urgent requirement for 1049');
});

test('a colon inside the text does not split the sender', () => {
  const { messages } = parseWhatsAppExport('[14/09/2026, 10:32:11] Alice: note: wrong shade on 1049');
  assert.equal(messages[0].sender, 'Alice');
  assert.equal(messages[0].text, 'note: wrong shade on 1049');
});

test('never throws on rubbish: unreadable lines are continuations, dates are validated', () => {
  assert.equal(parseWhatsAppExport('').messages.length, 0);
  assert.equal(parseWhatsAppExport('random text\nmore text').unparsedLines, 2);
  assert.equal(parseWhatsAppExport('[32/13/2026, 10:32:11] Alice: out of stock').messages.length, 0);
  assert.equal(waDateToYmd('29', '02', '2028'), '2028-02-29'); // leap day accepted
  assert.equal(waDateToYmd('29', '02', '2026'), null); // not a leap year
  assert.equal(waDateToYmd('14', '09', '26'), '2026-09-14'); // 2-digit year
});

test('critical signals are matched without case sensitivity', () => {
  assert.equal(hasCriticalSignal('OUT OF STOCK for 1049'), true);
  assert.equal(hasCriticalSignal('Customer rejected the shade'), true);
  assert.equal(hasCriticalSignal('Batch difference on 1049'), true);
  assert.equal(hasCriticalSignal('Please share the price list'), false);
});

test('chatter is never a case, however many numbers it contains', () => {
  const { messages } = parseWhatsAppExport(
    [
      '[14/09/2026, 10:32:11] Alice: out of stock for 1049',
      '[14/09/2026, 10:33:02] Bob: ok',
      '[14/09/2026, 10:34:02] Bob: thanks',
      '[14/09/2026, 10:35:02] Bob: 1049 1050 1051 sent',
    ].join('\n'),
  );
  const verdicts = classifyMessages(messages);
  assert.deepEqual(
    verdicts.map((v) => [v.isCase, v.skipReason]),
    [
      [true, null],
      [false, 'acknowledgement'],
      [false, 'acknowledgement'],
      [false, 'no_signal'],
    ],
  );
});

const message: WaMessage = {
  reportedOn: '2026-09-14',
  time: '10:32',
  sender: 'Alice',
  text: 'out of stock for 1049',
  line: 1,
};

/**
 * The identity of a message must not depend on where it sat in the file, so re-exporting the same
 * chat (which happens whenever new history is added) cannot create duplicate cases.
 */
test('the fingerprint is stable across exports and ignores whitespace', () => {
  assert.equal(messageFingerprint(message), messageFingerprint({ ...message, line: 99 }));
  assert.equal(messageFingerprint(message), messageFingerprint({ ...message, text: '  out   of stock\nfor 1049 ' }));
  // A different day, time, sender or text is a different message.
  assert.notEqual(messageFingerprint(message), messageFingerprint({ ...message, reportedOn: '2026-09-15' }));
  assert.notEqual(messageFingerprint(message), messageFingerprint({ ...message, sender: 'Bob' }));
  assert.notEqual(messageFingerprint(message), messageFingerprint({ ...message, text: 'out of stock for 1050' }));
});

test('the hash is the sha256 of the fingerprint, so both imports share one dedup column', async () => {
  const hash = await messageHash(message);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, await messageHash({ ...message, line: 7 }));
  // Same value as node:crypto, which is what the spreadsheet import writes.
  const { createHash } = await import('node:crypto');
  assert.equal(hash, createHash('sha256').update(messageFingerprint(message)).digest('hex'));
});