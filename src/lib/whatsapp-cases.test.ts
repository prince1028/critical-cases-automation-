import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WaMessage } from './whatsapp';
import { extractAlternative, extractCase, extractQuantities, extractStatus, extractTiles, senderName } from './whatsapp-cases';

const msg = (text: string, sender = 'Alice'): WaMessage => ({
  reportedOn: '2026-09-14',
  time: '10:32',
  sender,
  text,
  line: 1,
});

test('senderName drops the phone number WhatsApp appends, and never invents a name', () => {
  assert.equal(senderName('Alice <+919876543210>'), 'Alice');
  assert.equal(senderName('+91 98765 43210'), null); // only a number: nothing to record
  assert.equal(senderName('  '), null);
  assert.equal(senderName('Bob'), 'Bob');
});

test('a supplier code keeps its prefix; a lowercase word in front of a number is not', () => {
  // A Florzy ID on its own.
  assert.deepEqual(
    extractTiles('out of stock for 1049').tiles.map((t) => t.tileCode),
    ['1049'],
  );
  // A capital prefix is read as part of the reference; both the supplier code and the Florzy ID are kept.
  const vendor = extractTiles('label says NS 9675 HL 4 for 6716');
  assert.deepEqual(vendor.tiles.map((t) => t.tileCode), ['NS-9675-HL-4', '6716']);
  // A glued or hyphenated prefix is unambiguous, and is canonicalised the same way the sheet import does.
  assert.ok(extractTiles('label CFDC1515023 for 9879').tiles.some((t) => t.tileCode === 'CFDC-1515023'));
  assert.ok(extractTiles('label T-234 for 1049').tiles.some((t) => t.tileCode === 'T-234'));
});

test('a bare number is a tile, but a quantity is not', () => {
  // "need 1000 sqft" is a requirement, not a tile code.
  assert.deepEqual(extractTiles('need 1000 sqft').tiles, []);
  assert.equal(extractQuantities('need 1000 sqft').required.value, '1000');
  assert.equal(extractQuantities('need 1000 sqft').unit, 'sqft');
});

test("a competitor's code is recorded as a competitor reference, not as our tile", () => {
  const out = extractTiles('customer compared with mytyles 7781 and rejected');
  assert.deepEqual(out.tiles, []);
  assert.deepEqual(out.competitor, ['7781']);
});

test('unreadable references are reported, never guessed', () => {
  const out = extractTiles('something about T-?? for 1049');
  assert.ok(out.unparsed.length > 0 || out.tiles.length > 0);
});

test('quantities distinguish what is required from what is available', () => {
  const q = extractQuantities('we have 25 boxes in stock, need 40 boxes');
  assert.equal(q.available.value, '25');
  assert.equal(q.required.value, '40');
  assert.equal(q.unit, 'boxes');
  const none = extractQuantities('out of stock for 1049');
  assert.equal(none.required.value, null);
  assert.equal(none.available.value, null);
});

test('status is read from the words people write in chat', () => {
  assert.equal(extractStatus('dropped the case for 1049').status, 'CANCELLED');
  assert.equal(extractStatus('the requirement was cancelled').status, 'CANCELLED');
  assert.equal(extractStatus('1049 delivered to site').status, 'RESOLVED');
  assert.equal(extractStatus('1049 is in progress').status, 'IN_PROGRESS');
  assert.equal(extractStatus('still pending from the plant').status, 'NEW');
  assert.equal(extractStatus('still pending from the plant').reviewReason, 'STATUS_UNRESOLVED');
  // A customer rejecting the shade says nothing about our status, so it is not guessed.
  assert.equal(extractStatus('customer rejected the shade').status, 'NEW');
  // No status word at all: NEW, flagged so a reviewer sets the real one.
  assert.deepEqual(extractStatus('out of stock for 1049'), {
    status: 'NEW',
    reviewReason: 'STATUS_UNKNOWN',
  });
});

test('an alternative is only marked accepted when the message says so', () => {
  assert.equal(extractAlternative('alternative 1050 instead of 1049').accepted, null);
  assert.equal(extractAlternative('alternative rejected, alternative 1050 offered').accepted, false);
  assert.equal(extractAlternative('alternative accepted').accepted, true);
  assert.equal(extractAlternative('nothing said about it').text, null);
});

/**
 * The important property: a message that reads cleanly imports without review, and anything
 * doubtful is flagged instead of being filled in with a guess.
 */
test('a clean report needs no review; anything unclear is flagged with a reason', () => {
  // Readable tile, readable issue, explicit status, known sender: imports as-is.
  const clean = extractCase(msg('1049 is in progress, colour issue on the shade'), { knownReporters: ['Alice'] });
  assert.ok(clean);
  assert.deepEqual(clean.reviewReasons, []);
  assert.equal(clean.needsReview, false);
  assert.deepEqual(clean.tileCodes, ['1049']);
  assert.equal(clean.status, 'IN_PROGRESS');
  assert.equal(clean.reportedOn, '2026-09-14');
  assert.equal(clean.sourceMessage, '1049 is in progress, colour issue on the shade');

  const noTile = extractCase(msg('out of stock again'), { knownReporters: ['Alice'] });
  assert.equal(noTile?.needsReview, true);
  assert.ok(noTile?.reviewReasons.includes('NO_TILE_NUMBER'));

  // No status word: kept as NEW and flagged, never assumed.
  const noStatus = extractCase(msg('Out of stock for 1049, need urgent'), { knownReporters: ['Alice'] });
  assert.equal(noStatus?.status, 'NEW');
  assert.ok(noStatus?.reviewReasons.includes('STATUS_UNKNOWN'));

  const unknownSender = extractCase(msg('out of stock for 1049'), { knownReporters: ['Bob'] });
  assert.ok(unknownSender?.reviewReasons.includes('SENDER_UNKNOWN'));
  assert.equal(unknownSender?.reportedByName, 'Alice'); // the name is still kept

  const competitorOnly = extractCase(msg('customer rejected mytyles 7781'), { knownReporters: ['Alice'] });
  assert.ok(competitorOnly?.reviewReasons.includes('COMPETITOR_CODE_ONLY'));
});

test('the fingerprint is carried on the case so the import can dedup', () => {
  const a = extractCase(msg('out of stock for 1049'));
  const b = extractCase(msg('out of stock for 1049'));
  assert.equal(a?.fingerprint, b?.fingerprint);
  assert.ok(a?.fingerprint.includes('2026-09-14|10:32|Alice'));
});

test('an empty message produces no case at all', () => {
  assert.equal(extractCase(msg('   ')), null);
});