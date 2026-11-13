import assert from 'node:assert/strict';
import { test } from 'node:test';
import { messageRecipients, newCaseRecipients, updateRecipients, type CaseParties, type Person } from './notify-rules';

const p = (id: string, team: string | null, role: Person['role'] = 'SALES', active = true): Person => ({ id, team, role, active });
const people = [
  p('rep', 'Sales'),
  p('sales2', 'Sales'),
  p('sup1', 'Supply'),
  p('sup2', 'Supply'),
  p('supOld', 'Supply', 'SALES', false),
  p('list1', 'Listing'),
  p('admin', null, 'ADMIN'),
  p('mgr', null, 'MANAGER'),
];
const fresh: CaseParties = { reporterId: 'rep', assigneeId: null, participantIds: ['rep'], awaitingListing: false };

test('new case: active Supply team; Listing team only when the tile needs listing', () => {
  assert.deepEqual(newCaseRecipients(people, fresh), ['sup1', 'sup2']);
  assert.deepEqual(newCaseRecipients(people, { ...fresh, awaitingListing: true }), ['sup1', 'sup2', 'list1']);
});

test('message from the reporter before anyone handles it: the whole Supply team (and Listing while unlisted)', () => {
  assert.deepEqual(messageRecipients(people, fresh, 'rep'), ['sup1', 'sup2']);
  assert.deepEqual(messageRecipients(people, { ...fresh, awaitingListing: true }, 'rep'), ['sup1', 'sup2', 'list1']);
});

test('once a Supply member is involved, messages go to the people in the conversation only', () => {
  const c = { ...fresh, assigneeId: 'sup1', participantIds: ['rep', 'sup1'] };
  assert.deepEqual(messageRecipients(people, c, 'rep'), ['sup1']);
  assert.deepEqual(messageRecipients(people, c, 'sup1'), ['rep']);
  // A manager who joined the conversation hears replies too, but doesn't count as the handling side.
  assert.deepEqual(messageRecipients(people, { ...fresh, participantIds: ['rep', 'mgr'] }, 'rep'), ['mgr', 'sup1', 'sup2']);
});

test('the Listing team stops getting every message once one of them is involved', () => {
  const c = { ...fresh, awaitingListing: true, assigneeId: 'sup1', participantIds: ['rep', 'sup1', 'list1'] };
  assert.deepEqual(messageRecipients(people, c, 'rep'), ['sup1', 'list1']);
});

test('status change / listed: reporter and handler, never the person who did it, never inactive accounts', () => {
  const c = { ...fresh, assigneeId: 'sup1' };
  assert.deepEqual(updateRecipients(people, c, 'sup1'), ['rep']);
  assert.deepEqual(updateRecipients(people, c, 'rep'), ['sup1']);
  assert.deepEqual(updateRecipients(people, c, 'list1'), ['rep', 'sup1']);
  assert.deepEqual(updateRecipients(people, { ...c, assigneeId: 'supOld' }, 'rep'), []);
});
