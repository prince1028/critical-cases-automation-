import { expect, test, type Page } from '@playwright/test';
import type pg from 'pg';
import { RUN, chooseTileNotFound, connectDb, createTestUser, loginAs } from './helpers';

// Runs on the Neon e2e-test branch. Salesperson and Supply team talk on a case, as many times as they need.
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const SALES = `e2e.msg.s.${RUN}`;
const SUPPLY = `e2e.msg.supply.${RUN}`;
const SUPPLY_NAME = `E2E Msg Supply ${RUN}`;

let db: pg.Client;
let caseId = '';
test.beforeAll(async () => {
  db = await connectDb();
  await createTestUser(db, { name: `E2E Msg Sales ${RUN}`, username: SALES, team: 'Sales' });
  await createTestUser(db, { name: SUPPLY_NAME, username: SUPPLY, team: 'Supply' });
});
test.afterAll(async () => db?.end());
const q = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

const messages = (page: Page) => page.getByRole('list', { name: 'Messages' }).getByRole('listitem');

async function send(page: Page, text: string) {
  const before = await messages(page).count();
  await page.getByLabel('Message', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(messages(page)).toHaveCount(before + 1);
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue(''); // box clears for the next one
}

test.describe.configure({ mode: 'serial' });

test('salesperson and Supply team exchange several messages on a case', async ({ browser }) => {
  const sales = await loginAs(browser, SALES, BASE);
  await sales.goto(`${BASE}/cases/new`);
  await chooseTileNotFound(sales);
  await sales.getByRole('checkbox', { name: 'Out of Stock' }).click();
  await sales.getByLabel('Customer requirement / description *').fill(`E2E ${RUN}: customer needs 40 boxes`);
  await sales.getByRole('button', { name: 'Submit Case' }).click();
  await expect(sales).toHaveURL(/\/cases\/[0-9a-f-]{36}(\?created=1)?$/);
  caseId = new URL(sales.url()).pathname.split('/').pop()!;
  await expect(sales.getByText('No messages yet.')).toBeVisible();

  // Supply starts work with a note: it opens the conversation.
  const supply = await loginAs(browser, SUPPLY, BASE);
  await supply.goto(`${BASE}/cases/${caseId}`);
  await supply.getByRole('button', { name: 'Start working' }).click();
  const dialog = supply.getByRole('dialog');
  await dialog.getByRole('textbox').fill('Checking Morbi stock, will confirm by evening');
  await dialog.getByRole('button', { name: 'Start working' }).click();
  await expect(dialog).toBeHidden();
  await expect(messages(supply)).toHaveCount(1);
  await expect(messages(supply).first()).toContainText('Started working');

  // Salesperson sees it, and replies twice.
  await sales.reload();
  await expect(messages(sales).first()).toContainText(SUPPLY_NAME);
  await expect(messages(sales).first()).toContainText('Checking Morbi stock');
  await send(sales, 'Customer can wait till Friday');
  await send(sales, 'Also asking: is 20 boxes possible today?');

  // Supply's open page picks the replies up without a reload, then answers twice more.
  await expect(messages(supply)).toHaveCount(3, { timeout: 40_000 });
  await send(supply, '20 boxes possible, sending today');
  await send(supply, 'Rest arrives Thursday');

  await sales.reload();
  await expect(messages(sales)).toHaveCount(5);
  await expect(sales.getByText('Messages (5)')).toBeVisible();
  // Own messages are labelled "You".
  await expect(messages(sales).nth(1)).toContainText('You');
  await expect(messages(sales).nth(3)).toContainText(SUPPLY_NAME);

  const rows = await q<{ comment: string; username: string }>(
    `SELECT e.comment, u.username FROM case_events e JOIN users u ON u.id = e.user_id
      WHERE e.case_id = $1 AND e.event_type = 'COMMENT' ORDER BY e.created_at`,
    [caseId],
  );
  expect(rows).toEqual([
    { comment: 'Customer can wait till Friday', username: SALES },
    { comment: 'Also asking: is 20 boxes possible today?', username: SALES },
    { comment: '20 boxes possible, sending today', username: SUPPLY },
    { comment: 'Rest arrives Thursday', username: SUPPLY },
  ]);
  // The timeline stays a status history: messages aren't repeated there.
  await expect(sales.getByText('Comment', { exact: true })).toHaveCount(0);
});

test('messages keep working after the case is resolved; empty messages are refused', async ({ browser }) => {
  const supply = await loginAs(browser, SUPPLY, BASE);
  await supply.goto(`${BASE}/cases/${caseId}`);
  await supply.getByRole('button', { name: 'Resolve case' }).click();
  const dialog = supply.getByRole('dialog');
  await dialog.getByRole('textbox').fill('All 40 boxes delivered');
  await dialog.getByRole('button', { name: 'Resolve case' }).click();
  await expect(dialog).toBeHidden();
  await expect(messages(supply).last()).toContainText('Resolved');

  const sales = await loginAs(browser, SALES, BASE);
  await sales.goto(`${BASE}/cases/${caseId}`);
  await sales.getByLabel('Message', { exact: true }).fill('   ');
  await sales.getByRole('button', { name: 'Send' }).click();
  await expect(sales.getByText('Type a message first.')).toBeVisible();
  await send(sales, 'Thanks, customer received everything');
  await expect(messages(sales)).toHaveCount(7);
});

test('historical WhatsApp cases have no message box', async ({ browser }) => {
  const [{ id }] = await q<{ id: string }>("SELECT id FROM critical_cases WHERE source = 'WHATSAPP_HISTORICAL' LIMIT 1");
  const supply = await loginAs(browser, SUPPLY, BASE);
  await supply.goto(`${BASE}/cases/${id}`);
  await expect(supply.getByText('Original WhatsApp messages')).toBeVisible();
  await expect(supply.getByLabel('Message', { exact: true })).toHaveCount(0);
});
