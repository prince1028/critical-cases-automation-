import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
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
  assert.deepEqual(normalizeIssueTypes('OUT_OF_STOCK, DELIVERY_DELAY'), {
    primary: 'OUT_OF_STOCK', secondary: ['DELIVERY_DELAY'], unmapped: [],
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
