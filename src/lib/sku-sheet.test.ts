import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCsv, parseSkuSheet, searchSkus, SkuSheetError, topValues } from './sku-sheet';

// Same header as the real sheet (Florzy Code, Web Status, Sku Name, ... Material Type ...).
const CSV = [
  'Florzy Code,Web Status,Sku Name,Photo link 1,Photo link 2,Vendor Name,Dimension,Pcs/Box,Finish,Material Type,Thickness,Spacer,Randomness,Location',
  '7594,Live,CAPPUCCINO ESPRESSO,🔗,🔗,Vedic Ceramics,400x400mm,5,Rustic Matt,Vitrified,12mm,,1,Z2 E 02',
  '724,Live,GRAND VELETIN(ORD.DIG)1X1,🔗,🔗,Sultania Ceramics,300x300mm,11,Glossy Punch,Ceramic,9.5mm,,1,Z4 E 25',
  '7240,Discontinued,"FUJI BEIGE (202X202, 202X302 MM)",,,Sultania Ceramics,200x200mm,10,Matt,Ceramic,8mm,,1,',
  '72,Draft,"Say ""hello"" tile",,,QBO Marketing,600x1200mm,2,Matt,Vitrified,9mm,,1,',
  ',Draft,row without a code,,,,,,,,,,,',
  '0098,Live,Leading Zero,,,QBO Marketing,600x1200mm,2,,,,,,',
].join('\r\n');

test('CSV: quoted commas, doubled quotes, CRLF and a trailing line', () => {
  assert.deepEqual(parseCsv('a,"b,c","d ""e"""\r\n1,2,3\n'), [
    ['a', 'b,c', 'd "e"'],
    ['1', '2', '3'],
  ]);
  assert.deepEqual(parseCsv('x,"multi\nline"'), [['x', 'multi\nline']]);
});

test('sheet rows become items; codes kept exactly as text, blanks become null, rows without a code skipped', () => {
  const items = parseSkuSheet(CSV);
  assert.equal(items.length, 5);
  assert.deepEqual(items[0], {
    code: '7594', name: 'CAPPUCCINO ESPRESSO', status: 'Live', vendor: 'Vedic Ceramics', size: '400x400mm',
    finish: 'Rustic Matt', body: 'Vitrified', color: null, thickness: '12mm',
  });
  assert.equal(items[2].name, 'FUJI BEIGE (202X202, 202X302 MM)');
  assert.equal(items[3].name, 'Say "hello" tile');
  assert.equal(items[4].code, '0098'); // never turned into 98
  assert.equal(items[4].finish, null);
});

test('a colour column is used when the sheet gets one', () => {
  const [item] = parseSkuSheet('Florzy Code,Sku Name,Colour\n1,A,Beige');
  assert.equal(item.color, 'Beige');
});

test('a renamed required column gives a clear error', () => {
  assert.throws(() => parseSkuSheet('Code No,Sku Name\n1,a'), SkuSheetError);
  assert.throws(() => parseSkuSheet(''), SkuSheetError);
});

test('search: exact code first, then codes starting with it, then the rest; discontinued last', () => {
  const items = parseSkuSheet(CSV);
  assert.deepEqual(searchSkus(items, '72').map((i) => i.code), ['72', '724', '7240']);
  assert.deepEqual(searchSkus(items, '724').map((i) => i.code), ['724', '7240']);
  // Every word must match, anywhere: name, vendor, size, finish, body.
  assert.deepEqual(searchSkus(items, 'vitrified 600x1200').map((i) => i.code), ['72']);
  assert.deepEqual(searchSkus(items, 'cappuccino').map((i) => i.code), ['7594']);
  assert.deepEqual(searchSkus(items, 'fuji beige').map((i) => i.code), ['7240']);
  assert.deepEqual(searchSkus(items, 'nothing like this'), []);
  // Empty query: active items only.
  assert.ok(!searchSkus(items, '').some((i) => i.status === 'Discontinued'));
});

test('suggestions: distinct values, most used first', () => {
  const items = parseSkuSheet(CSV);
  assert.deepEqual(topValues(items, 'body'), ['Vitrified', 'Ceramic']);
  assert.equal(topValues(items, 'size')[0], '600x1200mm');
});
