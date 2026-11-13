import { expect, test } from '@playwright/test';
import type pg from 'pg';
import { connectDb, createTestUser, loginAs, RUN } from './helpers';

// Runs on the Neon e2e-test branch, against the full product (ANALYTICS_MVP=false).
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const ADMIN = { name: `E2E Analyst ${RUN}`, username: `e2e.analyst.${RUN}` };
const SALES = { name: `E2E Curious ${RUN}`, username: `e2e.curious.${RUN}` };

let db: pg.Client;

test.beforeAll(async () => {
  db = await connectDb();
  await createTestUser(db, { ...ADMIN, team: 'Operations', role: 'ADMIN' });
  await createTestUser(db, { ...SALES, team: 'Sales' });
});
test.afterAll(async () => db?.end());

test('non-admins cannot see or open Analytics', async ({ browser }) => {
  const page = await loginAs(browser, SALES.username, BASE);
  await expect(page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Analytics' })).toHaveCount(0);
  await page.goto(`${BASE}/admin/analytics`);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('admin sees analytics for every range and source', async ({ browser }) => {
  const page = await loginAs(browser, ADMIN.username, BASE);
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Analytics' }).click();
  await expect(page.getByRole('heading', { name: 'Critical Cases Analytics' })).toBeVisible();

  const [{ n }] = (
    await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM critical_cases
       WHERE coalesce(reported_on, (created_at AT TIME ZONE 'Asia/Kolkata')::date) >= (now() AT TIME ZONE 'Asia/Kolkata')::date - 89`,
    )
  ).rows;
  await expect(page.getByText('Total Critical Cases').locator('..')).toContainText(Number(n).toLocaleString('en-IN'));

  for (const range of ['30 days', '12 months', 'All time']) {
    await page.getByRole('navigation', { name: 'Date range' }).getByRole('link', { name: range }).click();
    await expect(page.getByRole('navigation', { name: 'Date range' }).getByRole('link', { name: range })).toHaveAttribute('aria-current', 'true');
    await expect(page.getByText('Top Critical Issues')).toBeVisible();
  }
  for (const source of ['App only', 'WhatsApp history', 'All cases']) {
    await page.getByRole('navigation', { name: 'Cases' }).getByRole('link', { name: source }).click();
    await expect(page.getByRole('navigation', { name: 'Cases' }).getByRole('link', { name: source })).toHaveAttribute('aria-current', 'true');
  }
  await page.screenshot({ path: 'e2e/screenshots/analytics-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'e2e/screenshots/analytics-mobile.png', fullPage: true });
});

/**
 * The drilldown is the point of the dashboard: a headline number, a chart column or a review reason
 * has to land on the cases behind it, with the filter it came from visible and removable.
 */
test('every signal drills down into the cases behind it', async ({ browser }) => {
  const page = await loginAs(browser, ADMIN.username, BASE);
  await page.goto(`${BASE}/analytics?range=all`);
  const explorer = page.locator('#explorer');
  await expect(explorer).toBeVisible();

  // A headline number.
  await page.getByText('Needs Review').first().click();
  await expect(explorer).toBeVisible();
  await expect(explorer.getByText('Needs review', { exact: false }).first()).toBeVisible();

  // A review reason, from the Needs Review card.
  const reason = page.locator('a[href*="reason="]').first();
  if (await reason.count()) {
    await reason.click();
    await expect(explorer).toBeVisible();
    // The chip says what narrowed the list, and removes it.
    const chip = explorer.getByRole('link', { name: /Remove this filter/ }).first();
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(explorer.getByRole('link', { name: /Remove this filter/ })).toHaveCount(0);
  }

  // A status row of the breakdown.
  await page.goto(`${BASE}/analytics?range=all`);
  await page.getByRole('link', { name: /^Resolved/ }).first().click();
  await expect(explorer).toBeVisible();
  await expect(explorer.getByRole('link', { name: /Remove this filter/ }).first()).toBeVisible();

  // A trend column.
  await page.goto(`${BASE}/analytics?range=12m`);
  await page.locator('a[href*="bucket="]').first().click();
  await expect(explorer).toBeVisible();
});

test('the Case Explorer is read-only and each row opens the case it came from', async ({ browser }) => {
  const page = await loginAs(browser, ADMIN.username, BASE);
  await page.goto(`${BASE}/analytics?range=all`);
  const explorer = page.locator('#explorer');
  // The explorer renders cards on a phone and a table on a desktop, so both are in the DOM and only
  // one of them is visible: ask for the visible one.
  const firstCase = explorer.locator('a[href^="/cases/"]:visible').first();
  await expect(firstCase).toBeVisible();

  // Nothing on the page can create, edit, assign or resolve a case.
  await expect(explorer.getByRole('button', { name: /report|edit|assign|resolve|close/i })).toHaveCount(0);

  await firstCase.click();
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]{36}$/);
});