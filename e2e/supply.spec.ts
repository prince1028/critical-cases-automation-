import { expect, test, type Browser, type Page } from '@playwright/test';
import type pg from 'pg';
import { connectDb, createTestUser, loginAs, RUN } from './helpers';

// Runs on the Neon e2e-test branch. Salesperson reports -> Supply team starts, resolves, closes, reopens.
const SALES = `E2E Sales ${RUN}`;
const SUPPLY = `E2E Supply ${RUN}`;
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const USERNAMES: Record<string, string> = { [SALES]: `e2e.s.${RUN}`, [SUPPLY]: `e2e.supply.${RUN}` };

let db: pg.Client;
test.beforeAll(async () => {
  db = await connectDb();
  await createTestUser(db, { name: SALES, username: USERNAMES[SALES], team: 'Sales' });
  await createTestUser(db, { name: SUPPLY, username: USERNAMES[SUPPLY], team: 'Supply' });
});
test.afterAll(async () => db?.end());
const q = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

async function enterAs(browser: Browser, name: string, _team: string): Promise<Page> {
  return loginAs(browser, USERNAMES[name], BASE);
}

async function reportCase(page: Page, text: string) {
  await page.goto(`${BASE}/cases/new`);
  await page.getByText('Tile not found / I don’t know the tile number').click();
  await page.getByRole('radio', { name: 'Out of Stock' }).click();
  await page.getByLabel('Customer requirement / description *').fill(text);
  await page.getByRole('button', { name: 'Submit Case' }).click();
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
}

async function runAction(page: Page, button: string, note?: string) {
  await page.getByRole('button', { name: button }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (note !== undefined) await dialog.getByRole('textbox').fill(note);
  await dialog.getByRole('button', { name: button }).click();
  await expect(dialog).toBeHidden();
}

test.describe.configure({ mode: 'serial' });

test('salesperson reports; Supply team starts and resolves; salesperson sees the resolution', async ({ browser }) => {
  const sales = await enterAs(browser, SALES, 'Sales');
  // Salespeople never see status controls
  const caseId = await reportCase(sales, `E2E ${RUN}: 50 boxes needed, none in stock`);
  await expect(sales.getByText('Case handling')).toHaveCount(0);
  await expect(sales.getByRole('button', { name: 'Resolve case' })).toHaveCount(0);

  const supply = await enterAs(browser, SUPPLY, 'Supply');
  // Supply dashboard shows the queue; case list opens on all cases
  await expect(supply.getByText('Waiting for Supply team')).toBeVisible();
  await supply.goto(`${BASE}/cases`);
  await expect(supply.getByRole('heading', { name: 'All Critical Cases' })).toBeVisible();

  await supply.goto(`${BASE}/cases/${caseId}`);
  await expect(supply.getByText('Case handling')).toBeVisible();

  // Start working (note optional)
  await runAction(supply, 'Start working');
  await expect(supply.getByText('case is now In Progress')).toBeVisible();
  await expect(supply.getByText('In Progress', { exact: true }).first()).toBeVisible();

  // Resolve requires a note
  await supply.getByRole('button', { name: 'Resolve case' }).click();
  await supply.getByRole('dialog').getByRole('button', { name: 'Resolve case' }).click();
  await expect(supply.getByRole('dialog').getByRole('alert')).toContainText('Please add a note');
  await supply.getByRole('dialog').getByRole('textbox').fill('Sourced 50 boxes from Morbi, delivered Saturday');
  await supply.getByRole('dialog').getByRole('button', { name: 'Resolve case' }).click();
  await expect(supply.getByRole('dialog')).toBeHidden();
  await expect(supply.getByText('case is now Resolved')).toBeVisible();
  await expect(supply.getByRole('button', { name: 'Reopen case' })).toBeVisible();

  // Neon: status, resolution, resolved_at, handler, audit trail
  const [row] = await q<{ status: string; resolution: string; resolved_at: Date | null; handler: string; source: string }>(
    `SELECT c.status, c.resolution, c.resolved_at, u.name AS handler, c.source
       FROM critical_cases c LEFT JOIN users u ON u.id = c.assigned_to WHERE c.id = $1`,
    [caseId],
  );
  expect(row).toMatchObject({ status: 'RESOLVED', resolution: 'Sourced 50 boxes from Morbi, delivered Saturday', handler: SUPPLY, source: 'APP' });
  expect(row.resolved_at).not.toBeNull();
  const events = await q<{ event_type: string; old_status: string; new_status: string; by: string }>(
    `SELECT e.event_type, e.old_value->>'status' AS old_status, e.new_value->>'status' AS new_status, u.name AS by
       FROM case_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.case_id = $1 ORDER BY e.created_at`,
    [caseId],
  );
  expect(events.map((e) => [e.event_type, e.old_status, e.new_status, e.by])).toEqual([
    ['CREATED', null, 'NEW', SALES],
    ['STATUS_CHANGED', 'NEW', 'IN_PROGRESS', SUPPLY],
    ['STATUS_CHANGED', 'IN_PROGRESS', 'RESOLVED', SUPPLY],
  ]);

  // Timeline shows the changes
  await expect(supply.getByText('Status: New → In Progress')).toBeVisible();
  await expect(supply.getByText('Status: In Progress → Resolved')).toBeVisible();

  // Salesperson now sees Resolved + resolution, still no controls
  await sales.goto(`${BASE}/cases/${caseId}`);
  await expect(sales.getByText('Resolved', { exact: true }).first()).toBeVisible();
  await expect(sales.getByText('Sourced 50 boxes from Morbi, delivered Saturday').first()).toBeVisible();
  await expect(sales.getByText(`Handled by`)).toBeVisible();
  await expect(sales.getByRole('button', { name: 'Reopen case' })).toHaveCount(0);
  await sales.goto(`${BASE}/dashboard`);
  await expect(sales.getByText('My Resolved').locator('..').getByText('1')).toBeVisible();
});

test('Supply team can close a case with a reason and reopen it', async ({ browser }) => {
  const sales = await enterAs(browser, SALES, 'Sales');
  const caseId = await reportCase(sales, `E2E ${RUN}: customer no longer needs it`);
  const supply = await enterAs(browser, SUPPLY, 'Supply');
  await supply.goto(`${BASE}/cases/${caseId}`);

  await runAction(supply, 'Close case', 'Customer cancelled the order');
  await expect(supply.getByText('case is now Cancelled')).toBeVisible();
  let [row] = await q<{ status: string }>('SELECT status FROM critical_cases WHERE id = $1', [caseId]);
  expect(row.status).toBe('CANCELLED');

  await runAction(supply, 'Reopen case', 'Customer called back, still needs it');
  await expect(supply.getByText('case is now In Progress')).toBeVisible();
  [row] = await q<{ status: string }>('SELECT status FROM critical_cases WHERE id = $1', [caseId]);
  expect(row.status).toBe('IN_PROGRESS');
  await expect(supply.getByText('Customer called back, still needs it')).toBeVisible();
});

test('historical WhatsApp cases stay read-only even for the Supply team', async ({ browser }) => {
  const supply = await enterAs(browser, SUPPLY, 'Supply');
  const [hist] = await q<{ id: string; status: string; updated_at: Date }>(
    "SELECT id, status, updated_at FROM critical_cases WHERE case_code = 'CC-004'",
  );
  await supply.goto(`${BASE}/cases/${hist.id}`);
  await expect(supply.getByText('Historical WhatsApp cases are kept exactly as imported')).toBeVisible();
  await expect(supply.getByRole('button', { name: 'Resolve case' })).toHaveCount(0);
  const [after] = await q<{ status: string; updated_at: Date }>('SELECT status, updated_at FROM critical_cases WHERE id = $1', [hist.id]);
  expect(after).toEqual({ status: hist.status, updated_at: hist.updated_at });
});
