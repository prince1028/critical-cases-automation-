import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alertRecipients, buildNewCaseEmail, parseRecipients, type NewCaseEmailData } from './case-email';

const base: NewCaseEmailData = {
  caseId: '11111111-1111-1111-1111-111111111111',
  caseCode: 'CC-120',
  issueType: 'INSUFFICIENT_STOCK',
  severity: 'CRITICAL',
  tileCode: '6716',
  tileLabel: 'Statuario Glossy',
  description: 'Needs single batch <within> 10 days & "urgent"',
  requestedColor: null,
  requestedSize: null,
  requestedFinish: null,
  requiredQuantity: '120',
  availableQuantity: '40.5',
  unit: 'boxes',
  alternativeTileText: null,
  notes: null,
  reporterName: 'Saroj',
  reporterTeam: 'Sales',
  createdAt: new Date('2026-10-01T06:30:00Z'),
};

test('subject flags severity, code, issue and tile', () => {
  assert.equal(buildNewCaseEmail(base).subject, '[Critical] CC-120: Insufficient Stock · 6716 · Statuario Glossy');
  assert.equal(buildNewCaseEmail({ ...base, severity: 'LOW', tileCode: null, tileLabel: null }).subject, 'CC-120: Insufficient Stock');
});

test('html escapes user text and links to the case', () => {
  const { html, text } = buildNewCaseEmail(base, 'https://cases.example.com/');
  assert.ok(html.includes('&lt;within&gt; 10 days &amp; &quot;urgent&quot;'));
  assert.ok(!html.includes('<within>'));
  assert.ok(html.includes('href="https://cases.example.com/cases/11111111-1111-1111-1111-111111111111"'));
  assert.ok(text.includes('Required: 120 boxes'));
  assert.ok(text.includes('Available: 40.5 boxes'));
  assert.ok(text.includes('Reported by: Saroj (Sales)'));
  assert.ok(!text.includes('Colour wanted'), 'empty fields are left out');
});

test('no link without an app URL', () => {
  assert.ok(!buildNewCaseEmail(base).html.includes('Open the case'));
});

test('recipient list parsing', () => {
  assert.deepEqual(parseRecipients(' A@x.com, b@y.in;a@x.com  junk , c@z.co '), ['a@x.com', 'b@y.in', 'c@z.co']);
  assert.deepEqual(parseRecipients(undefined), []);
  assert.deepEqual(parseRecipients(''), []);
});

test('alert recipients: fixed list plus active Supply members with an email, no duplicates', () => {
  const members = [
    { email: 'sup1@florzy.com', team: 'Supply', active: true },
    { email: 'SUP2@florzy.com', team: 'supply chain', active: true },
    { email: 'left@florzy.com', team: 'Supply', active: false },
    { email: null, team: 'Supply', active: true },
    { email: 'sales@florzy.com', team: 'Sales', active: true },
    { email: 'boss@florzy.com', team: 'Supply', active: true },
  ];
  assert.deepEqual(alertRecipients('boss@florzy.com, me@gmail.com', members), [
    'boss@florzy.com',
    'me@gmail.com',
    'sup1@florzy.com',
    'sup2@florzy.com',
  ]);
  assert.deepEqual(alertRecipients(undefined, []), []);
});
