import { expect, test, type Page } from '@playwright/test';
import type pg from 'pg';
import { connectDb, createTestUser, login, PASSWORD, RUN } from './helpers';

// Runs against the Neon e2e-test branch (see playwright.config.ts). Test data never reaches production.
const NAME = `E2E Salesperson ${RUN}`;
const USERNAME = `e2e.sales.${RUN}`;
const TEAM = 'Sales';
const TILE_CODE = '7594';

let db: pg.Client;
test.beforeAll(async () => {
  db = await connectDb();
  await createTestUser(db, { name: NAME, username: USERNAME, team: TEAM });
});
test.afterAll(async () => db?.end());

const q = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page should not scroll horizontally').toBeLessThanOrEqual(1);
}

test.describe.configure({ mode: 'serial' });

test('logged-out users can only reach /login', async ({ page, request }) => {
  for (const path of ['/dashboard', '/cases', '/cases/new', '/cases/00000000-0000-0000-0000-000000000000', '/']) {
    await page.goto(path);
    await expect(page, `${path} should redirect`).toHaveURL(/\/login$/);
  }
  await expect(page.getByText('Critical Case Management')).toBeVisible();
  const api = await request.get('/api/tiles?q=7594');
  expect(api.status()).toBe(401);
});

test('forged session cookie is rejected', async ({ page, context }) => {
  await context.addCookies([{ name: 'florzy_session', value: 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ4In0.forged', url: (process.env.E2E_BASE_URL ?? 'http://localhost:3100') }]);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

test('login failures: empty fields, wrong password, unknown user (same generic message)', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByText('Enter your username')).toBeVisible();
  await expect(page.getByText('Enter your password')).toBeVisible();

  await login(page, USERNAME, 'wrong-password-1');
  await expect(page.getByRole('alert').filter({ hasText: 'Invalid username or password.' })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Username')).toHaveValue(USERNAME); // kept; the password is never echoed back
  await expect(page.getByLabel('Password')).toHaveValue('');

  await login(page, `nobody.${RUN}`, PASSWORD);
  await expect(page.getByRole('alert').filter({ hasText: 'Invalid username or password.' })).toBeVisible();

  const [{ failed_login_attempts }] = await q<{ failed_login_attempts: number }>(
    'SELECT failed_login_attempts FROM users WHERE username = $1',
    [USERNAME],
  );
  expect(failed_login_attempts).toBe(1);
});

test('full salesperson flow: enter -> dashboard -> report case with tile -> Neon -> My Cases -> detail -> logout', async ({ page }) => {
  const [{ n: tilesBefore }] = await q<{ n: string }>('SELECT count(*) AS n FROM tiles');
  const [{ n: historicalBefore }] = await q<{ n: string }>(
    "SELECT count(*) AS n FROM critical_cases WHERE source = 'WHATSAPP_HISTORICAL'",
  );

  // 1-3. Login -> dashboard
  await login(page, USERNAME);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: `Welcome, ${NAME}` })).toBeVisible();
  // Empty case list for a new salesperson
  await expect(page.getByText('No critical cases yet.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Report Your First Case' })).toBeVisible();

  const [user] = await q<{ id: string; role: string; team: string; failed_login_attempts: number; last_login_at: Date | null }>(
    'SELECT id, role, team, failed_login_attempts, last_login_at FROM users WHERE username = $1',
    [USERNAME],
  );
  expect(user.role).toBe('SALES');
  expect(user.team).toBe(TEAM);
  expect(user.failed_login_attempts).toBe(0); // reset by the successful login
  expect(user.last_login_at).not.toBeNull();

  // 4-5. Search and select an existing tile
  await page.getByRole('link', { name: 'Report Critical Case' }).click();
  await expect(page).toHaveURL(/\/cases\/new$/);
  await page.getByRole('combobox').first().click();
  await page.getByPlaceholder('Type a tile code or name…').fill(TILE_CODE);
  const option = page.getByRole('option').filter({ hasText: TILE_CODE }).first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.getByText(`Tile ${TILE_CODE}`, { exact: true })).toBeVisible();
  await expect(page.getByText('Brown Rustic Matt Vitrified Moroccan Tile').first()).toBeVisible();

  // 6. Select issue
  await page.getByRole('radio', { name: 'Insufficient Stock' }).click();
  await page.screenshot({ path: 'e2e/screenshots/desktop-report.png', fullPage: true });

  // Invalid submission: required fields for Insufficient Stock left empty
  await page.getByRole('button', { name: 'Submit Case' }).click();
  await expect(page.getByText('Add a few words about the customer requirement')).toBeVisible();
  await expect(page.getByText('Enter the required quantity')).toBeVisible();
  await expect(page).toHaveURL(/\/cases\/new$/);
  expect((await q('SELECT 1 FROM critical_cases WHERE reported_by = $1', [user.id])).length).toBe(0);

  // 7-8. Fill details and submit
  await page.getByLabel('Customer requirement / description *').fill(`E2E ${RUN}: customer needs 120 sqft, only 0 in stock`);
  await page.getByLabel('Required qty *').fill('120');
  await page.getByLabel('Available qty *').fill('0');
  await page.getByRole('combobox', { name: 'Unit *' }).click();
  await page.getByRole('option', { name: 'sqft' }).click();
  await page.getByRole('combobox', { name: 'Severity' }).click();
  await page.getByRole('option', { name: 'High' }).click();
  await page.getByLabel('Additional notes').fill('Customer visiting store Saturday');
  await page.getByRole('button', { name: 'Submit Case' }).click();

  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/Case CC-\d{3,} reported/)).toBeVisible(); // success toast
  const caseId = page.url().split('/').pop()!;

  // 9-14. Verify in Neon
  const [row] = await q<{
    case_code: string; tile_code: string | null; reported_by: string; status: string; source: string;
    issue_type: string; required_quantity: string; available_quantity: string; unit: string; severity: string; age_s: number;
  }>(
    `SELECT c.case_code, t.tile_code, c.reported_by, c.status, c.source, c.issue_type, c.required_quantity,
            c.available_quantity, c.unit, c.severity, extract(epoch FROM now() - c.created_at) AS age_s
       FROM critical_cases c LEFT JOIN tiles t ON t.id = c.tile_id WHERE c.id = $1`,
    [caseId],
  );
  expect(row.tile_code).toBe(TILE_CODE);
  expect(row.reported_by).toBe(user.id);
  expect(row.status).toBe('NEW');
  expect(row.source).toBe('APP');
  expect(row.issue_type).toBe('INSUFFICIENT_STOCK');
  expect(Number(row.required_quantity)).toBe(120);
  expect(Number(row.available_quantity)).toBe(0);
  expect(row.unit).toBe('sqft');
  expect(row.severity).toBe('HIGH');
  expect(Number(row.age_s)).toBeLessThan(300);
  expect(row.case_code).toMatch(/^CC-\d{3,}$/);
  expect(Number(row.case_code.slice(3))).toBeGreaterThan(114);

  const events = await q<{ event_type: string; user_id: string; new_value: { status: string }; comment: string }>(
    'SELECT event_type, user_id, new_value, comment FROM case_events WHERE case_id = $1',
    [caseId],
  );
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ event_type: 'CREATED', user_id: user.id, comment: 'Customer visiting store Saturday' });
  expect(events[0].new_value.status).toBe('NEW');
  const links = await q('SELECT 1 FROM case_tiles WHERE case_id = $1', [caseId]);
  expect(links).toHaveLength(1);

  // Detail page (success view)
  await expect(page.getByRole('heading', { name: `Critical Case #${row.case_code}` })).toBeVisible();
  await expect(page.getByText('Reported Just now')).toBeVisible();
  await expect(page.getByText('Insufficient Stock').first()).toBeVisible();
  await expect(page.getByText('120 sqft', { exact: true })).toBeVisible();
  await expect(page.getByText('Case reported', { exact: true })).toBeVisible(); // timeline
  await page.screenshot({ path: 'e2e/screenshots/desktop-case-detail.png', fullPage: true });
  await expect(page.getByRole('link', { name: 'Back to My Cases' }).first()).toBeVisible();

  // Case WITHOUT a tile
  await page.goto('/cases/new');
  await page.getByText('Tile not found / I don’t know the tile number').click();
  await page.getByLabel('Tile name or details (optional)').fill('Crystal Black 2x2 (E2E)');
  await page.getByRole('radio', { name: 'Delivery Delay' }).click();
  await page.getByLabel('Customer requirement / description *').fill(`E2E ${RUN}: needs delivery within 7 days`);
  await page.getByRole('button', { name: 'Submit Case' }).click();
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]{36}$/);
  const noTileId = page.url().split('/').pop()!;
  const [nt] = await q<{ tile_id: string | null; requested_tile_name: string; source: string; status: string }>(
    'SELECT tile_id, requested_tile_name, source, status FROM critical_cases WHERE id = $1',
    [noTileId],
  );
  expect(nt).toMatchObject({ tile_id: null, requested_tile_name: 'Crystal Black 2x2 (E2E)', source: 'APP', status: 'NEW' });
  await expect(page.getByText('Crystal Black 2x2 (E2E)')).toBeVisible();

  // No tiles were created, historical cases untouched
  const [{ n: tilesAfter }] = await q<{ n: string }>('SELECT count(*) AS n FROM tiles');
  expect(tilesAfter).toBe(tilesBefore);
  const [{ n: historicalAfter }] = await q<{ n: string }>(
    "SELECT count(*) AS n FROM critical_cases WHERE source = 'WHATSAPP_HISTORICAL'",
  );
  expect(historicalAfter).toBe(historicalBefore);

  // 15. My Cases shows both, with search and status filter
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Critical Cases', exact: true }).click();
  await expect(page).toHaveURL(/\/cases$/);
  await expect(page.getByRole('heading', { name: 'My Cases' })).toBeVisible();
  await expect(page.getByText('2 cases')).toBeVisible();
  await expect(page.getByRole('link', { name: row.case_code })).toBeVisible();
  await page.getByLabel('Search cases').fill(TILE_CODE);
  await expect(page).toHaveURL(new RegExp(`q=${TILE_CODE}`));
  await expect(page.getByText('1 case match your filters')).toBeVisible();
  await page.getByLabel('Search cases').fill('');
  await page.getByRole('combobox', { name: 'Filter by status' }).click();
  await page.getByRole('option', { name: 'Resolved' }).click();
  await expect(page.getByText('No cases match your filters.')).toBeVisible();
  // SALES users don't get the all-cases toggle
  await expect(page.getByRole('button', { name: 'All cases' })).toHaveCount(0);

  // A salesperson cannot open someone else's (historical) case
  const [hist] = await q<{ id: string }>("SELECT id FROM critical_cases WHERE source = 'WHATSAPP_HISTORICAL' LIMIT 1");
  await page.goto(`/cases/${hist.id}`);
  await expect(page.getByRole('heading', { name: 'Case not found' })).toBeVisible();
  // ...and ?scope=all is ignored for SALES
  await page.goto('/cases?scope=all');
  await expect(page.getByRole('heading', { name: 'My Cases' })).toBeVisible();
  await expect(page.getByText('2 cases')).toBeVisible();

  // 16. Open detail from the list
  await page.goto('/cases');
  await page.getByRole('link', { name: row.case_code }).click();
  await expect(page.getByRole('heading', { name: `Critical Case #${row.case_code}` })).toBeVisible();

  // Dashboard counters reflect the new cases
  await page.goto('/dashboard');
  await expect(page.getByText('My Open Cases').locator('..').getByText('2')).toBeVisible();

  // 17-18. Logout, then protected pages are closed again
  await page.getByRole('button', { name: 'User menu' }).click();
  await expect(page.getByText('Sales · Sales')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login$/);
  for (const path of ['/dashboard', '/cases', `/cases/${caseId}`, '/cases/new']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test('usernames are not case-sensitive', async ({ page }) => {
  await login(page, `  ${USERNAME.toUpperCase()} `);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('mobile layout: dashboard, report form and case list fit a phone screen', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await login(page, USERNAME, PASSWORD, (process.env.E2E_BASE_URL ?? 'http://localhost:3100'));
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: `Welcome, ${NAME}` })).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: 'e2e/screenshots/mobile-dashboard.png', fullPage: true });

  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('navigation', { name: 'Main mobile' }).getByRole('link', { name: 'Report Case' }).click();
  await expect(page).toHaveURL(/\/cases\/new$/);
  await page.getByRole('radio', { name: 'Damaged Tile' }).click();
  await noHorizontalScroll(page);
  await page.screenshot({ path: 'e2e/screenshots/mobile-report.png', fullPage: true });

  await page.goto('/cases');
  await expect(page.getByRole('heading', { name: 'My Cases' })).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: 'e2e/screenshots/mobile-cases.png', fullPage: true });
  await ctx.close();
});

test('ADMIN can switch to all cases and open a historical case (read-only)', async ({ page }) => {
  const adminName = `E2E Admin ${RUN}`;
  await createTestUser(db, { name: adminName, username: `e2e.admin.${RUN}`, team: 'Operations', role: 'ADMIN' });
  const [{ n: historical }] = await q<{ n: string }>("SELECT count(*) AS n FROM critical_cases WHERE source = 'WHATSAPP_HISTORICAL'");

  await login(page, `e2e.admin.${RUN}`);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/cases');
  await page.getByRole('button', { name: 'All cases' }).click();
  await expect(page).toHaveURL(/scope=all/);
  await expect(page.getByRole('heading', { name: 'All Critical Cases' })).toBeVisible();
  const total = Number((await page.getByText(/^\d[\d,]* cases$/).textContent())!.replace(/\D/g, ''));
  expect(total).toBeGreaterThanOrEqual(Number(historical));
  await expect(page.getByRole('navigation', { name: 'Pagination' })).toBeVisible();

  const [hist] = await q<{ id: string; case_code: string }>("SELECT id, case_code FROM critical_cases WHERE case_code = 'CC-022'");
  await page.goto(`/cases/${hist.id}`);
  await expect(page.getByRole('heading', { name: 'Critical Case #CC-022' })).toBeVisible();
  await expect(page.getByText('WhatsApp history').first()).toBeVisible();
  await expect(page.getByText('Original WhatsApp messages')).toBeVisible();
  await expect(page.getByText('Imported from the WhatsApp critical-supply group history')).toBeVisible();
});
