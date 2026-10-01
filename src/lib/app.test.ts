import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ISSUE_TYPES } from '../db/schema';
import { ISSUE_FIELDS } from './case-fields';
import { ISSUE_LABELS } from './constants';
import { formatQuantity, formatRelative } from './format';
import { signSession, verifySessionToken } from './session-token';
import { adminCreateUserSchema, changePasswordSchema, loginSchema, newCaseSchema, usernameSchema } from './validation';

const SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
const TILE = '03b3cc26-3d90-4cbd-9a08-b649321bf5f5';

const base = { issueType: 'OUT_OF_STOCK', description: 'Customer needs 120 sqft by Friday' };

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
  assert.ok(!r.success && r.error.issues.some((i) => i.path[0] === 'tileId'));

  const withTile = newCaseSchema.parse({ ...base, tileId: TILE });
  assert.equal(withTile.tileId, TILE);

  const noTile = newCaseSchema.parse({ ...base, tileId: '', noTile: 'on', requestedTileName: 'Crystal Black 2x2' });
  assert.equal(noTile.tileId, null);
  assert.equal(noTile.requestedTileName, 'Crystal Black 2x2');
});

test('newCaseSchema: rejects a non-UUID tile id (no free-text tile codes from the browser)', () => {
  const r = newCaseSchema.safeParse({ ...base, tileId: '1049' });
  assert.equal(r.success, false);
});

test('newCaseSchema: INSUFFICIENT_STOCK requires quantities and unit', () => {
  const r = newCaseSchema.safeParse({ ...base, issueType: 'INSUFFICIENT_STOCK', tileId: TILE });
  assert.equal(r.success, false);
  const paths = !r.success ? r.error.issues.map((i) => i.path[0]) : [];
  for (const f of ['requiredQuantity', 'availableQuantity', 'unit']) assert.ok(paths.includes(f), f);

  const ok = newCaseSchema.parse({
    ...base, issueType: 'INSUFFICIENT_STOCK', tileId: TILE, requiredQuantity: '120', availableQuantity: '0', unit: 'sqft',
  });
  assert.equal(ok.requiredQuantity, 120);
  assert.equal(ok.availableQuantity, 0); // an explicit 0 stays 0
});

test('newCaseSchema: empty quantities stay null (never 0); bad numbers are rejected', () => {
  const ok = newCaseSchema.parse({ ...base, tileId: TILE, requiredQuantity: '', availableQuantity: '' });
  assert.equal(ok.requiredQuantity, null);
  assert.equal(ok.availableQuantity, null);
  assert.equal(newCaseSchema.safeParse({ ...base, tileId: TILE, requiredQuantity: 'abc', unit: 'boxes' }).success, false);
  assert.equal(newCaseSchema.safeParse({ ...base, tileId: TILE, requiredQuantity: '-5', unit: 'boxes' }).success, false);
});

test('newCaseSchema: quantities need a unit; COLOR_UNAVAILABLE needs a colour', () => {
  assert.equal(newCaseSchema.safeParse({ ...base, tileId: TILE, requiredQuantity: '10' }).success, false);
  const r = newCaseSchema.safeParse({ ...base, tileId: TILE, issueType: 'COLOR_UNAVAILABLE' });
  assert.ok(!r.success && r.error.issues.some((i) => i.path[0] === 'requestedColor'));
});

test('newCaseSchema: description is required; alternativeAccepted maps to boolean', () => {
  assert.equal(newCaseSchema.safeParse({ issueType: 'OTHER', tileId: TILE, description: '' }).success, false);
  const d = newCaseSchema.parse({ ...base, tileId: TILE, alternativeAccepted: 'no' });
  assert.equal(d.alternativeAccepted, false);
  assert.equal(newCaseSchema.parse({ ...base, tileId: TILE, alternativeAccepted: '' }).alternativeAccepted, null);
});

test('newCaseSchema: unknown issue types and severities are rejected', () => {
  assert.equal(newCaseSchema.safeParse({ ...base, tileId: TILE, issueType: 'CASE_CREATED' }).success, false);
  assert.equal(newCaseSchema.safeParse({ ...base, tileId: TILE, severity: 'URGENT' }).success, false);
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
