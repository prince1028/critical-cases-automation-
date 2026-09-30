import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateTempPassword, hashPassword, verifyPassword } from './password';

test('hashPassword never stores the password and verifies correctly', async () => {
  const hash = await hashPassword('tiles2026');
  assert.ok(hash.startsWith('scrypt$'));
  assert.ok(!hash.includes('tiles2026'));
  assert.equal(await verifyPassword('tiles2026', hash), true);
  assert.equal(await verifyPassword('tiles2027', hash), false);
  assert.equal(await verifyPassword('tiles2026', null), false);
  assert.equal(await verifyPassword('tiles2026', 'garbage'), false);
});

test('same password hashes differently each time (random salt)', async () => {
  assert.notEqual(await hashPassword('same-pass1'), await hashPassword('same-pass1'));
});

test('temporary passwords are random and meet the password rules', () => {
  const a = generateTempPassword();
  assert.match(a, /^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
  assert.notEqual(a, generateTempPassword());
});
