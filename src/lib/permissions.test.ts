import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedActions, canManageCases, canSeeAllCases, isSupplyTeam, STATUS_ACTIONS } from './permissions';

test('Supply team detection', () => {
  for (const t of ['Supply', 'supply', 'Supply Team', 'Supply chain', 'SUPPLY']) assert.equal(isSupplyTeam(t), true, t);
  for (const t of ['Sales', 'Operation', 'Suppliers', 'Resupplying', '', null, undefined]) assert.equal(isSupplyTeam(t), false, String(t));
});

test('only the Supply team and admins can change status', () => {
  assert.equal(canManageCases({ role: 'SALES', team: 'Supply' }), true);
  assert.equal(canManageCases({ role: 'ADMIN', team: 'Operation' }), true);
  assert.equal(canManageCases({ role: 'SALES', team: 'Sales' }), false);
  assert.equal(canManageCases({ role: 'MANAGER', team: 'Sales' }), false);
  assert.equal(canManageCases({ role: 'SALES', team: null }), false);
});

test('who can browse all cases', () => {
  assert.equal(canSeeAllCases({ role: 'SALES', team: 'Sales' }), false);
  assert.equal(canSeeAllCases({ role: 'SALES', team: 'Supply' }), true);
  assert.equal(canSeeAllCases({ role: 'MANAGER', team: 'Sales' }), true);
});

test('status transitions', () => {
  assert.deepEqual(allowedActions('NEW'), ['START', 'RESOLVE', 'CLOSE']);
  assert.deepEqual(allowedActions('IN_PROGRESS'), ['RESOLVE', 'CLOSE']);
  assert.deepEqual(allowedActions('RESOLVED'), ['REOPEN']);
  assert.deepEqual(allowedActions('CANCELLED'), ['REOPEN']);
  assert.equal(STATUS_ACTIONS.RESOLVE.to, 'RESOLVED');
  assert.equal(STATUS_ACTIONS.CLOSE.to, 'CANCELLED');
  assert.equal(STATUS_ACTIONS.RESOLVE.noteRequired, true);
  assert.equal(STATUS_ACTIONS.CLOSE.noteRequired, true);
  assert.equal(STATUS_ACTIONS.START.noteRequired, false);
});
