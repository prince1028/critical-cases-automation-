import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signupSchema } from './validation';

const ok = { name: ' Saroj  Kumar ', username: 'Saroj.K', team: 'Sales', password: 'tiles2026', confirmPassword: 'tiles2026' };

test('signup normalises name and username', () => {
  const d = signupSchema.parse(ok);
  assert.equal(d.name, 'Saroj Kumar');
  assert.equal(d.username, 'saroj.k');
  assert.equal(d.team, 'Sales');
});

test('signup cannot self-grant Supply team powers', () => {
  for (const team of ['Supply', 'supply team', 'Supply Chain']) {
    const r = signupSchema.safeParse({ ...ok, team });
    assert.equal(r.success, false, team);
    assert.ok(!r.success && r.error.issues.some((i) => i.path[0] === 'team'));
  }
});

test('signup password rules and confirmation', () => {
  assert.equal(signupSchema.safeParse({ ...ok, password: 'short1', confirmPassword: 'short1' }).success, false);
  assert.equal(signupSchema.safeParse({ ...ok, confirmPassword: 'different1' }).success, false);
  assert.equal(signupSchema.safeParse({ ...ok, username: 'a b' }).success, false);
});
