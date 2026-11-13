import { expect, test, type Page } from '@playwright/test';
import type pg from 'pg';
import { chooseTileNotFound, connectDb, createTestUser, loginAs, RUN } from './helpers';

// Runs on the Neon e2e-test branch: bell notifications for new cases, messages, status changes and listing.
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const SALES = { name: `E2E Notif Sales ${RUN}`, username: `e2e.n.s.${RUN}`, team: 'Sales' };
const SUPPLY = { name: `E2E Notif Supply ${RUN}`, username: `e2e.n.sup.${RUN}`, team: 'Supply' };
const LISTING = { name: `E2E Notif Listing ${RUN}`, username: `e2e.n.list.${RUN}`, team: 'Listing' };

let db: pg.Client;
const ids: Record<string, string> = {};
test.beforeAll(async () => {
  db = await connectDb();
  for (const u of [SALES, SUPPLY, LISTING]) ids[u.username] = await createTestUser(db, u);
});
test.afterAll(async () => db?.end());

/** This user's notifications for the case, oldest first (written after the response, so poll). */
const notes = (username: string, caseId: string) =>
  db
    .query<{ kind: string; title: string; body: string | null; read_at: Date | null }>(
      'SELECT kind, title, body, read_at FROM notifications WHERE user_id = $1 AND case_id = $2 ORDER BY created_at',
      [ids[username], caseId],
    )
    .then((r) => r.rows);
const kinds = (username: string, caseId: string) => async () => (await notes(username, caseId)).map((n) => n.kind);

const bell = (page: Page) => page.getByRole('link', { name: /^Notifications/ });

test.describe.configure({ mode: 'serial' });

test('new case, messages, status and listing reach the right people, in the bell', async ({ browser }) => {
  // Salesperson reports a case whose tile isn't in the item list.
  const sales = await loginAs(browser, SALES.username, BASE);
  await sales.goto(`${BASE}/cases/new`);
  await chooseTileNotFound(sales);
  await sales.getByRole('checkbox', { name: 'Out of Stock' }).click();
  await sales.getByLabel('Customer requirement / description *').fill(`E2E ${RUN}: notification flow`);
  await sales.getByRole('button', { name: 'Submit Case' }).click();
  await expect(sales).toHaveURL(/\/cases\/[0-9a-f-]{36}/);
  const caseId = new URL(sales.url()).pathname.split('/').pop()!;

  // Supply and Listing get "new case"; the reporter doesn't notify themselves.
  await expect.poll(kinds(SUPPLY.username, caseId)).toEqual(['NEW_CASE']);
  await expect.poll(kinds(LISTING.username, caseId)).toEqual(['NEW_CASE']);
  expect((await notes(LISTING.username, caseId))[0].title).toContain('needs listing');
  expect(await notes(SALES.username, caseId)).toHaveLength(0);

  // Supply sees it in the bell and on the Notifications page; opening the case marks it read.
  const supply = await loginAs(browser, SUPPLY.username, BASE);
  await expect(bell(supply)).toHaveAccessibleName(/unread/);
  await bell(supply).click();
  await expect(supply.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  const item = supply.getByRole('list', { name: 'Notifications' }).getByRole('link').filter({ hasText: `from ${SALES.name}` });
  await expect(item.first()).toBeVisible();
  await item.first().click();
  await expect(supply).toHaveURL(new RegExp(`/cases/${caseId}`));
  await expect.poll(async () => (await notes(SUPPLY.username, caseId)).every((n) => n.read_at)).toBe(true);

  // The salesperson asks a question before anyone handles it: Supply and Listing both hear it.
  await sales.getByLabel('Message', { exact: true }).fill('Any update? Customer is waiting');
  await sales.getByRole('button', { name: 'Send' }).click();
  await expect.poll(kinds(SUPPLY.username, caseId)).toEqual(['NEW_CASE', 'MESSAGE']);
  await expect.poll(kinds(LISTING.username, caseId)).toEqual(['NEW_CASE', 'MESSAGE']);
  const msg = (await notes(SUPPLY.username, caseId))[1];
  expect(msg.title).toBe(`New message from ${SALES.name}`);
  expect(msg.body).toBe('Any update? Customer is waiting');

  // Supply starts work with a note: the salesperson is told.
  await supply.reload();
  await supply.getByRole('button', { name: 'Start working' }).click();
  await supply.getByRole('dialog').getByRole('textbox').fill('Checking with the vendor');
  await supply.getByRole('dialog').getByRole('button', { name: 'Start working' }).click();
  await expect.poll(kinds(SALES.username, caseId)).toEqual(['STATUS']);
  const status = (await notes(SALES.username, caseId))[0];
  expect(status.title).toBe(`Work started by ${SUPPLY.name}`);
  expect(status.body).toBe('Checking with the vendor');

  // Listing gives the thumbs up: the salesperson and the Supply member handling it are told.
  const listing = await loginAs(browser, LISTING.username, BASE);
  await listing.goto(`${BASE}/cases/${caseId}`);
  await listing.getByRole('button', { name: 'Item listed' }).click();
  await expect(listing.getByText('Marked as listed 👍')).toBeVisible();
  await expect.poll(kinds(SALES.username, caseId)).toEqual(['STATUS', 'LISTED']);
  await expect.poll(kinds(SUPPLY.username, caseId)).toEqual(['NEW_CASE', 'MESSAGE', 'LISTED']);

  // Now everyone is in the conversation: a reply goes to them, not to the whole team.
  await supply.reload();
  await supply.getByLabel('Message', { exact: true }).fill('Arrives Thursday');
  await supply.getByRole('button', { name: 'Send' }).click();
  await expect.poll(kinds(SALES.username, caseId)).toEqual(['STATUS', 'LISTED', 'MESSAGE']);
  await expect.poll(kinds(LISTING.username, caseId)).toEqual(['NEW_CASE', 'MESSAGE', 'MESSAGE']);
  expect(await kinds(SUPPLY.username, caseId)()).toEqual(['NEW_CASE', 'MESSAGE', 'LISTED']); // not their own message

  // Mark all read empties the bell.
  await sales.goto(`${BASE}/notifications`);
  await expect(sales.getByText(/\d+ unread/)).toBeVisible();
  await sales.getByRole('button', { name: 'Mark all read' }).click();
  await expect(sales.getByText('You’re all caught up.')).toBeVisible();
  await expect(bell(sales)).toHaveAccessibleName('Notifications');
});

test('the bell needs a signed-in user', async ({ playwright }) => {
  const anon = await playwright.request.newContext();
  expect((await anon.get(`${BASE}/api/notifications`)).status()).toBe(401);
  await anon.dispose();
});
