import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedActions, canAddPhotos, canManageCases, canMarkListed, isListingTeam, statusActionsFor, canSeeAllCases, isSupplyTeam, STATUS_ACTIONS } from './permissions';

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

test('adding photos: reporter or anyone who sees all cases, app cases only', () => {
  const sales = { id: 'u1', role: 'SALES' as const, team: 'Sales' };
  const supply = { id: 'u2', role: 'SALES' as const, team: 'Supply' };
  const manager = { id: 'u3', role: 'MANAGER' as const, team: null };
  const own = { source: 'APP', reportedBy: 'u1' };
  const others = { source: 'APP', reportedBy: 'u9' };
  assert.equal(canAddPhotos(sales, own), true);
  assert.equal(canAddPhotos(sales, others), false);
  assert.equal(canAddPhotos(supply, others), true);
  assert.equal(canAddPhotos(manager, others), true);
  assert.equal(canAddPhotos(supply, { source: 'WHATSAPP_HISTORICAL', reportedBy: null }), false);
  assert.equal(canAddPhotos(sales, { source: 'WHATSAPP_HISTORICAL', reportedBy: 'u1' }), false);
});

test('status actions: Supply gets every transition, the reporter may only close, others nothing', () => {
  const reporter = { id: 'u1', role: 'SALES' as const, team: 'Sales' };
  const otherSales = { id: 'u4', role: 'SALES' as const, team: 'Sales' };
  const supply = { id: 'u2', role: 'SALES' as const, team: 'Supply' };
  const manager = { id: 'u3', role: 'MANAGER' as const, team: null };
  const open = { source: 'APP', reportedBy: 'u1', status: 'NEW' as const, listingRequired: false, listedAt: null };
  assert.deepEqual(statusActionsFor(reporter, open), ['CLOSE']);
  assert.deepEqual(statusActionsFor(reporter, { ...open, status: 'IN_PROGRESS' }), ['CLOSE']);
  assert.deepEqual(statusActionsFor(reporter, { ...open, status: 'CANCELLED' }), []); // no reopening it themselves
  assert.deepEqual(statusActionsFor(reporter, { ...open, status: 'RESOLVED' }), []);
  assert.deepEqual(statusActionsFor(otherSales, open), []);
  assert.deepEqual(statusActionsFor(manager, open), []); // managers see cases but don't handle them
  assert.deepEqual(statusActionsFor(supply, open), ['START', 'RESOLVE', 'CLOSE']);
  assert.deepEqual(statusActionsFor(supply, { ...open, source: 'WHATSAPP_HISTORICAL' }), []);
  assert.deepEqual(statusActionsFor(reporter, { ...open, source: 'WHATSAPP_HISTORICAL' }), []);
});

test('Listing team: detection, thumbs up, and the reporter waits for it before closing', () => {
  assert.equal(isListingTeam('Listing'), true);
  assert.equal(isListingTeam('listing team'), true);
  assert.equal(isListingTeam('Catalogue Listing'), true);
  assert.equal(isListingTeam('Listings'), false);
  assert.equal(isListingTeam(null), false);

  const listing = { id: 'u5', role: 'SALES' as const, team: 'Listing' };
  const supply = { id: 'u2', role: 'SALES' as const, team: 'Supply' };
  assert.equal(canMarkListed(listing), true);
  assert.equal(canMarkListed({ role: 'ADMIN', team: null }), true);
  assert.equal(canMarkListed(supply), false);
  assert.equal(canSeeAllCases(listing), true); // to find the cases waiting for them
  assert.equal(canManageCases(listing), false); // but they don't resolve or close cases

  const reporter = { id: 'u1', role: 'SALES' as const, team: 'Sales' };
  const unlisted = { source: 'APP', reportedBy: 'u1', status: 'NEW' as const, listingRequired: true, listedAt: null };
  assert.deepEqual(statusActionsFor(reporter, unlisted), []);
  assert.deepEqual(statusActionsFor(reporter, { ...unlisted, listedAt: new Date() }), ['CLOSE']);
  // The Supply team isn't held up by listing.
  assert.deepEqual(statusActionsFor(supply, unlisted), ['START', 'RESOLVE', 'CLOSE']);
  assert.deepEqual(statusActionsFor(listing, unlisted), []);
});
