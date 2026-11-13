import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ISSUE_TYPES } from '../db/schema';
import { ISSUE_FIELDS } from './case-fields';
import { ISSUE_LABELS } from './constants';
import { formatQuantity, formatRelative } from './format';
import { signSession, verifySessionToken } from './session-token';
import { adminCreateUserSchema, changePasswordSchema, loginSchema, newCaseSchema, usernameSchema } from './validation';

const SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
const TILE = '7594';

const DETAILS = { tileColor: 'Brown', tileSize: '400x400mm', tileFinish: 'Rustic Matt', tileBody: 'Vitrified' };
const base = { issueTypes: 'OUT_OF_STOCK', description: 'Customer needs 120 sqft by Friday', ...DETAILS };

test('every issue type has a friendly label and a field config', () => {
  for (const t of ISSUE_TYPES) {
    assert.ok(ISSUE_LABELS[t], t);
    assert.ok(ISSUE_FIELDS[t], t);
  }
  assert.equal(ISSUE_LABELS.INSUFFICIENT_STOCK, 'Insufficient Stock');
});

test('newCaseSchema: a tile or the "tile not found" option is required', () => {
  const r = newCaseSchema.safeParse({ ...base });
  assert.equal(r.success, false);
  assert.ok(!r.success && r.error.issues.some((i) => i.path[0] === 'skuCode'));

  const withTile = newCaseSchema.parse({ ...base, skuCode: TILE });
  assert.equal(withTile.skuCode, TILE);

  const noTile = newCaseSchema.parse({ ...base, skuCode: '', noTile: 'on', requestedTileName: 'Crystal Black 2x2' });
  assert.equal(noTile.skuCode, null);
  assert.equal(noTile.requestedTileName, 'Crystal Black 2x2');
});

test('newCaseSchema: colour, size, finish and body are required on every report', () => {
  for (const f of Object.keys(DETAILS)) {
    const r = newCaseSchema.safeParse({ ...base, skuCode: TILE, [f]: '  ' });
    assert.ok(!r.success && r.error.issues.some((i) => i.path[0] === f), f);
  }
  const ok = newCaseSchema.parse({ ...base, skuCode: TILE, tileBody: ' Full Body Vitrified ' });
  assert.equal(ok.tileBody, 'Full Body Vitrified');
});

test('newCaseSchema: INSUFFICIENT_STOCK requires quantities and unit', () => {
  const r = newCaseSchema.safeParse({ ...base, issueTypes: 'INSUFFICIENT_STOCK', skuCode: TILE });
  assert.equal(r.success, false);
  const paths = !r.success ? r.error.issues.map((i) => i.path[0]) : [];
  for (const f of ['requiredQuantity', 'availableQuantity', 'unit']) assert.ok(paths.includes(f), f);

  const ok = newCaseSchema.parse({
    ...base, issueTypes: 'INSUFFICIENT_STOCK', skuCode: TILE, requiredQuantity: '120', availableQuantity: '0', unit: 'sqft',
  });
  assert.equal(ok.requiredQuantity, 120);
  assert.equal(ok.availableQuantity, 0); // an explicit 0 stays 0
});

test('newCaseSchema: empty quantities stay null (never 0); bad numbers are rejected', () => {
  const ok = newCaseSchema.parse({ ...base, skuCode: TILE, requiredQuantity: '', availableQuantity: '' });
  assert.equal(ok.requiredQuantity, null);
  assert.equal(ok.availableQuantity, null);
  assert.equal(newCaseSchema.safeParse({ ...base, skuCode: TILE, requiredQuantity: 'abc', unit: 'boxes' }).success, false);
  assert.equal(newCaseSchema.safeParse({ ...base, skuCode: TILE, requiredQuantity: '-5', unit: 'boxes' }).success, false);
});

test('newCaseSchema: quantities need a unit; COLOR_UNAVAILABLE needs a colour', () => {
  assert.equal(newCaseSchema.safeParse({ ...base, skuCode: TILE, requiredQuantity: '10' }).success, false);
  const r = newCaseSchema.safeParse({ ...base, skuCode: TILE, issueTypes: 'COLOR_UNAVAILABLE' });
  assert.ok(!r.success && r.error.issues.some((i) => i.path[0] === 'requestedColor'));
});

test('newCaseSchema: description is required; alternativeAccepted maps to boolean', () => {
  assert.equal(newCaseSchema.safeParse({ issueTypes: 'OTHER', skuCode: TILE, description: '' }).success, false);
  const d = newCaseSchema.parse({ ...base, skuCode: TILE, alternativeAccepted: 'no' });
  assert.equal(d.alternativeAccepted, false);
  assert.equal(newCaseSchema.parse({ ...base, skuCode: TILE, alternativeAccepted: '' }).alternativeAccepted, null);
});

test('newCaseSchema: unknown issue types and severities are rejected', () => {
  assert.equal(newCaseSchema.safeParse({ ...base, skuCode: TILE, issueTypes: 'CASE_CREATED' }).success, false);
  assert.equal(newCaseSchema.safeParse({ ...base, skuCode: TILE, severity: 'URGENT' }).success, false);
});

test('usernames are normalised to lowercase and restricted to safe characters', () => {
  assert.equal(usernameSchema.parse('  Praduman.T '), 'praduman.t');
  for (const bad of ['ab', 'has space', '-start', 'emoji😀', 'a'.repeat(33)]) assert.equal(usernameSchema.safeParse(bad).success, false, bad);
  assert.equal(loginSchema.parse({ username: ' PRINCE ', password: 'x' }).username, 'prince');
});

test('new passwords need 8+ chars with a letter and a number, and must be confirmed', () => {
  const ok = { currentPassword: 'Temp-1234', newPassword: 'tiles2026', confirmPassword: 'tiles2026' };
  assert.equal(changePasswordSchema.safeParse(ok).success, true);
  assert.equal(changePasswordSchema.safeParse({ ...ok, newPassword: 'short1', confirmPassword: 'short1' }).success, false);
  assert.equal(changePasswordSchema.safeParse({ ...ok, newPassword: 'onlyletters', confirmPassword: 'onlyletters' }).success, false);
  assert.equal(changePasswordSchema.safeParse({ ...ok, confirmPassword: 'different1' }).success, false);
  assert.equal(changePasswordSchema.safeParse({ ...ok, newPassword: 'Temp-1234', confirmPassword: 'Temp-1234' }).success, false);
});

test('admin create-user validation', () => {
  const u = adminCreateUserSchema.parse({ name: ' Sai  Prasad ', username: 'Sai', team: 'Supply', role: 'SALES' });
  assert.deepEqual(u, { name: 'Sai Prasad', username: 'sai', team: 'Supply', email: null, role: 'SALES' });
  assert.equal(adminCreateUserSchema.safeParse({ ...u, role: 'SUPERUSER' }).success, false);
  assert.equal(adminCreateUserSchema.parse({ ...u, email: ' Sai.P@Florzy.com ' }).email, 'sai.p@florzy.com');
  assert.equal(adminCreateUserSchema.parse({ ...u, email: '' }).email, null);
  assert.equal(adminCreateUserSchema.safeParse({ ...u, email: 'not-an-email' }).success, false);
});

test('session tokens: round-trip, tamper and wrong-secret rejection', async () => {
  const token = await signSession({ userId: TILE, v: 3 }, SECRET);
  assert.deepEqual(await verifySessionToken(token, SECRET), { userId: TILE, v: 3 });
  assert.equal(await verifySessionToken(token.slice(0, -2) + 'xx', SECRET), null);
  assert.equal(await verifySessionToken(token, SECRET + '-other'), null);
  assert.equal(await verifySessionToken(undefined, SECRET), null);
  await assert.rejects(() => signSession({ userId: TILE, v: 1 }, 'short'));
});

test('format helpers', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  assert.equal(formatRelative(new Date('2026-09-30T11:59:40Z'), now), 'Just now');
  assert.equal(formatRelative(new Date('2026-09-30T11:55:00Z'), now), '5 minutes ago');
  assert.equal(formatQuantity('120.00', 'sqft'), '120 sqft');
  assert.equal(formatQuantity(null, 'sqft'), null);
});

test('newCaseSchema: several problems, in the order picked; the first is the main one', () => {
  const d = newCaseSchema.parse({ ...base, skuCode: TILE, issueTypes: ['DAMAGED_TILE', 'LEAD_TIME', 'DAMAGED_TILE'] });
  assert.equal(d.issueType, 'DAMAGED_TILE');
  assert.deepEqual(d.secondaryIssueTypes, ['LEAD_TIME']); // duplicates dropped
  assert.equal(newCaseSchema.parse({ ...base, skuCode: TILE }).secondaryIssueTypes, null);
  // The form echoes them back comma-joined after a failed submit; that parses too.
  assert.equal(newCaseSchema.parse({ ...base, skuCode: TILE, issueTypes: 'OTHER,PRICE_ISSUE' }).secondaryIssueTypes?.[0], 'PRICE_ISSUE');
  assert.equal(newCaseSchema.safeParse({ ...base, skuCode: TILE, issueTypes: [] }).success, false);
  const six = ['OUT_OF_STOCK', 'DAMAGED_TILE', 'WRONG_TILE', 'WRONG_QUANTITY', 'LEAD_TIME', 'PRICE_ISSUE'];
  assert.equal(newCaseSchema.safeParse({ ...base, skuCode: TILE, issueTypes: six }).success, false);
});

test('newCaseSchema: required fields of every picked problem apply', () => {
  const r = newCaseSchema.safeParse({ ...base, skuCode: TILE, issueTypes: ['INSUFFICIENT_STOCK', 'COLOR_UNAVAILABLE'] });
  assert.ok(!r.success);
  const paths = r.error.issues.map((i) => i.path[0]);
  for (const f of ['requiredQuantity', 'availableQuantity', 'unit', 'requestedColor']) assert.ok(paths.includes(f), f);
});
