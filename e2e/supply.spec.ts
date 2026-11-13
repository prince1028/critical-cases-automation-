import { expect, test, type Browser, type Page } from '@playwright/test';
import type pg from 'pg';
import { RUN, chooseTileNotFound, connectDb, createTestUser, loginAs } from './helpers';

// Runs on the Neon e2e-test branch. Salesperson reports -> Supply team starts, resolves, closes, reopens.
const SALES = `E2E Sales ${RUN}`;
const SUPPLY = `E2E Supply ${RUN}`;
const LISTING = `E2E Listing ${RUN}`;
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const USERNAMES: Record<string, string> = { [SALES]: `e2e.s.${RUN}`, [SUPPLY]: `e2e.supply.${RUN}`, [LISTING]: `e2e.listing.${RUN}` };

let db: pg.Client;
test.beforeAll(async () => {
  db = await connectDb();
  await createTestUser(db, { name: SALES, username: USERNAMES[SALES], team: 'Sales' });
  await createTestUser(db, { name: SUPPLY, username: USERNAMES[SUPPLY], team: 'Supply' });
  await createTestUser(db, { name: LISTING, username: USERNAMES[LISTING], team: 'Listing' });
});
test.afterAll(async () => db?.end());
const q = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

async function enterAs(browser: Browser, name: string, _team: string): Promise<Page> {
  return loginAs(browser, USERNAMES[name], BASE);
}

async function reportCase(page: Page, text: string) {
  await page.goto(`${BASE}/cases/new`);
  await chooseTileNotFound(page);
  await page.getByRole('checkbox', { name: 'Out of Stock' }).click();
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
  await expect(sales.getByRole('link', { name: 'My Resolved: 1' })).toBeVisible();
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

test('tile not in the system: the Listing team gives the thumbs up, then the salesperson can close it', async ({ browser }) => {
  const sales = await enterAs(browser, SALES, 'Sales');
  const caseId = await reportCase(sales, `E2E ${RUN}: customer bought elsewhere`);
  const [created] = await q<{ listing_required: boolean; listed_at: Date | null }>(
    'SELECT listing_required, listed_at FROM critical_cases WHERE id = $1',
    [caseId],
  );
  expect(created).toEqual({ listing_required: true, listed_at: null });

  // Waiting for listing: the salesperson can't close it yet.
  await expect(sales.getByText('Needs listing')).toBeVisible();
  await expect(sales.getByText('Waiting for the Listing team')).toBeVisible();
  for (const b of ['Close case', 'Start working', 'Resolve case', 'Reopen case', 'Item listed']) {
    await expect(sales.getByRole('button', { name: b })).toHaveCount(0);
  }

  // Another salesperson can't even open it.
  const otherName = `e2e.s2.${RUN}`;
  await createTestUser(db, { name: `E2E Sales Two ${RUN}`, username: otherName, team: 'Sales' });
  const other = await loginAs(browser, otherName, BASE);
  await other.goto(`${BASE}/cases/${caseId}`);
  await expect(other.getByRole('heading', { name: 'Case not found' })).toBeVisible();

  // The Listing team finds it from the dashboard and gives the thumbs up; they don't handle the case otherwise.
  const listing = await enterAs(browser, LISTING, 'Listing');
  await expect(listing.getByText('Waiting for Listing team')).toBeVisible();
  await listing.getByRole('link', { name: /Tiles to list/ }).click();
  await expect(listing.getByRole('heading', { name: 'Waiting for listing' })).toBeVisible();
  await listing.goto(`${BASE}/cases/${caseId}`);
  for (const b of ['Start working', 'Resolve case', 'Close case']) {
    await expect(listing.getByRole('button', { name: b })).toHaveCount(0);
  }
  await listing.getByLabel('Note (optional)').fill('Listed as tile code 9931');
  await listing.getByRole('button', { name: 'Item listed' }).click();
  await expect(listing.getByText('Marked as listed 👍')).toBeVisible();
  await expect(listing.getByText('Listed 👍', { exact: true })).toBeVisible();
  await expect(listing.getByRole('button', { name: 'Item listed' })).toHaveCount(0);
  const [listed] = await q<{ listed_at: Date | null; username: string }>(
    'SELECT c.listed_at, u.username FROM critical_cases c JOIN users u ON u.id = c.listed_by WHERE c.id = $1',
    [caseId],
  );
  expect(listed.listed_at).not.toBeNull();
  expect(listed.username).toBe(USERNAMES[LISTING]);

  // Now the salesperson may close it: only close, and only with a reason.
  await sales.reload();
  await expect(sales.getByText('Listed as tile code 9931')).toBeVisible(); // the note shows in Messages
  await expect(sales.getByText('Close this case')).toBeVisible();
  for (const b of ['Start working', 'Resolve case', 'Reopen case']) {
    await expect(sales.getByRole('button', { name: b })).toHaveCount(0);
  }
  await sales.getByRole('button', { name: 'Close case' }).click();
  const dialog = sales.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Close case' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Please add a note');
  await dialog.getByRole('textbox').fill('Customer bought from another store');
  await dialog.getByRole('button', { name: 'Close case' }).click();
  await expect(dialog).toBeHidden();
  await expect(sales.getByText('case is now Cancelled')).toBeVisible();
  await expect(sales.getByText('Close this case')).toHaveCount(0); // closed: nothing more for the reporter to do

  const [row] = await q<{ status: string; assigned_to: string | null }>('SELECT status, assigned_to FROM critical_cases WHERE id = $1', [caseId]);
  expect(row).toEqual({ status: 'CANCELLED', assigned_to: null });
  const [ev] = await q<{ username: string; comment: string; new_value: { action: string } }>(
    `SELECT u.username, e.comment, e.new_value FROM case_events e JOIN users u ON u.id = e.user_id
      WHERE e.case_id = $1 AND e.event_type = 'STATUS_CHANGED'`,
    [caseId],
  );
  expect(ev).toMatchObject({ username: USERNAMES[SALES], comment: 'Customer bought from another store', new_value: { action: 'CLOSE' } });

  // The Supply team sees who closed it and why, and can still reopen it.
  const supply = await enterAs(browser, SUPPLY, 'Supply');
  await supply.goto(`${BASE}/cases/${caseId}`);
  const msgs = supply.getByRole('list', { name: 'Messages' });
  await expect(msgs).toContainText('Item listed 👍');
  await expect(msgs).toContainText('Closed');
  await expect(msgs).toContainText('Customer bought from another store');
  await expect(msgs).toContainText(SALES);
  await expect(supply.getByRole('button', { name: 'Reopen case' })).toBeVisible();
});

test('a case with a known tile needs no listing: the salesperson can close it straight away', async ({ browser }) => {
  const sales = await enterAs(browser, SALES, 'Sales');
  await sales.goto(`${BASE}/cases/new`);
  await sales.getByRole('combobox').first().click();
  await sales.getByPlaceholder('Type a tile code or name…').fill('7594');
  await sales.getByRole('option').filter({ hasText: '7594' }).first().click();
  await sales.getByLabel(/^Colour \*/).fill('Brown');
  // Two problems at once; unticking a third leaves it out.
  await sales.getByRole('checkbox', { name: 'Out of Stock' }).click();
  await sales.getByRole('checkbox', { name: 'Price Issue' }).click();
  await sales.getByRole('checkbox', { name: 'Lead Time' }).click();
  await sales.getByRole('checkbox', { name: 'Price Issue' }).click();
  await expect(sales.getByRole('checkbox', { name: 'Price Issue' })).toHaveAttribute('aria-checked', 'false');
  await sales.getByLabel('Customer requirement / description *').fill(`E2E ${RUN}: known tile, customer changed mind`);
  await sales.getByRole('button', { name: 'Submit Case' }).click();
  await expect(sales).toHaveURL(/\/cases\/[0-9a-f-]{36}/);
  const caseId = new URL(sales.url()).pathname.split('/').pop()!;
  await expect(sales.getByText('Needs listing')).toHaveCount(0);
  await expect(sales.getByText('Out of Stock, Lead Time')).toBeVisible();
  const [issues] = await q<{ issue_type: string; secondary_issue_types: string[] }>(
    'SELECT issue_type, secondary_issue_types::text[] AS secondary_issue_types FROM critical_cases WHERE id = $1',
    [caseId],
  );
  expect(issues).toEqual({ issue_type: 'OUT_OF_STOCK', secondary_issue_types: ['LEAD_TIME'] });
  await runAction(sales, 'Close case', 'Customer changed their mind');
  await expect(sales.getByText('case is now Cancelled')).toBeVisible();
  const [row] = await q<{ status: string; listing_required: boolean }>(
    'SELECT status, listing_required FROM critical_cases WHERE id = $1',
    [caseId],
  );
  expect(row).toEqual({ status: 'CANCELLED', listing_required: false });
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
