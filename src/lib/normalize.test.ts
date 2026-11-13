import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  findIssueTypesInText,
  normalizeIssueTypes,
  normalizeStatus,
  normalizeTileNumber,
  parseQuantity,
  parseSheetDate,
  parseYesNo,
} from './normalize';

test('normalizeTileNumber: obvious variations collapse to one form', () => {
  for (const v of ['T-234', 'T234', 't-234', 'T 234', ' t234 ']) assert.equal(normalizeTileNumber(v), 'T-234');
  assert.equal(normalizeTileNumber('#SA1268'), 'SA-1268');
  assert.equal(normalizeTileNumber('TL 10711 B'), 'TL-10711-B');
  assert.equal(normalizeTileNumber('TL-10711-B'), 'TL-10711-B');
  assert.equal(normalizeTileNumber('Omega 7008'), 'OMEGA-7008');
  assert.equal(normalizeTileNumber('3013 EL'), '3013-EL');
});

test('normalizeTileNumber: never turns quantities, sizes or prices into tile numbers', () => {
  for (const v of ['120 sqft', '120 SQFT', '14 boxes', '600x600', '2x4', 'Rs 90', '₹105', '9 mm', '20 days', '50 pcs']) {
    assert.equal(normalizeTileNumber(v, { allowBareNumber: true }), null, v);
  }
  assert.equal(normalizeTileNumber('Unknown'), null);
  assert.equal(normalizeTileNumber('Palace Verde'), null); // no digit -> a name, not a number
  assert.equal(normalizeTileNumber(''), null);
});

test('normalizeTileNumber: bare numbers only when explicitly allowed', () => {
  assert.equal(normalizeTileNumber('7594'), null);
  assert.equal(normalizeTileNumber('7594', { allowBareNumber: true }), '7594');
  assert.equal(normalizeTileNumber('12', { allowBareNumber: true }), null);
});

test('normalizeIssueTypes', () => {
  assert.deepEqual(normalizeIssueTypes('OUT_OF_STOCK, LEAD_TIME'), {
    primary: 'OUT_OF_STOCK', secondary: ['LEAD_TIME'], unmapped: [],
  });
  assert.deepEqual(normalizeIssueTypes('out of stock'), { primary: 'OUT_OF_STOCK', secondary: [], unmapped: [] });
  const weird = normalizeIssueTypes('Customer angry');
  assert.equal(weird.primary, 'OTHER');
  assert.deepEqual(weird.unmapped, ['Customer angry']);
});

test('normalizeStatus', () => {
  assert.deepEqual(normalizeStatus('Resolved'), { status: 'RESOLVED' });
  assert.deepEqual(normalizeStatus('Resolution offered'), { status: 'IN_PROGRESS' });
  assert.deepEqual(normalizeStatus('Open'), { status: 'NEW' });
  assert.deepEqual(normalizeStatus('Unresolved'), { status: 'NEW', reviewReason: 'STATUS_UNRESOLVED' });
  assert.deepEqual(normalizeStatus('Unknown'), { status: 'NEW', reviewReason: 'STATUS_UNKNOWN' });
});

/**
 * A chat message is prose, not a cell: the vocabulary is matched as phrases anywhere in the text
 * rather than by splitting on separators.
 */
test('findIssueTypesInText reads phrases anywhere in a sentence', () => {
  assert.deepEqual(findIssueTypesInText('1049 is in progress, colour issue on the shade'), {
    primary: 'COLOR_UNAVAILABLE',
    secondary: [],
    unmapped: [],
  });
  assert.deepEqual(findIssueTypesInText('We are out of stock for 1049 and need urgent'), {
    primary: 'OUT_OF_STOCK',
    secondary: [],
    unmapped: [],
  });
  // Several types, primary is the one named first.
  assert.deepEqual(findIssueTypesInText('delivery delay and wrong shade for 1049'), {
    primary: 'LEAD_TIME',
    secondary: ['COLOR_UNAVAILABLE'],
    unmapped: [],
  });
  // Nothing recognised: OTHER, and the message is kept for the reviewer.
  assert.deepEqual(findIssueTypesInText('please share the price list'), {
    primary: 'OTHER',
    secondary: [],
    unmapped: ['please share the price list'],
  });
  // A single ambiguous word is not enough on its own, so it is not read as a case.
  assert.equal(findIssueTypesInText('the pricing is fine').primary, 'OTHER');
  assert.equal(findIssueTypesInText('price increase on 1049').primary, 'PRICE_ISSUE');
  assert.equal(findIssueTypesInText('unpriced chatter').primary, 'OTHER');
  assert.deepEqual(findIssueTypesInText(''), { primary: 'OTHER', secondary: [], unmapped: [] });
});

test('parseQuantity keeps missing as null, never 0', () => {
  assert.equal(parseQuantity('1000'), 1000);
  assert.equal(parseQuantity('25,000'), 25000);
  assert.equal(parseQuantity('509.96'), 509.96);
  assert.equal(parseQuantity('0 (no stock pan-India)'), 0);
  assert.equal(parseQuantity('Unknown'), null);
  assert.equal(parseQuantity('250-300'), null);
  assert.equal(parseQuantity('110; 442'), null);
  assert.equal(parseQuantity('30 boxes / 270 sqft'), null);
});

test('parseSheetDate and parseYesNo', () => {
  assert.equal(parseSheetDate('06/04/26'), '2026-04-06');
  assert.equal(parseSheetDate('31/02/26'), null);
  assert.equal(parseSheetDate('garbage'), null);
  assert.equal(parseYesNo('Yes (deal on)'), true);
  assert.equal(parseYesNo('No (Elemento Black rejected)'), false);
  assert.equal(parseYesNo("Unclear ('sold', SKU not stated)"), null);
  assert.equal(parseYesNo('N/A'), null);
});
