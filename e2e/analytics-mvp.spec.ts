import { expect, test } from '@playwright/test';
import { PASSWORD, RUN } from './helpers';

/**
 * The temporary Analytics MVP, run against the server started with ANALYTICS_MVP=true and the auth
 * bypass on (see playwright.config.ts, project "analytics-mvp"). It checks the three things the MVP
 * promises: the dashboard opens without a session, only two destinations are visible, and the pages
 * the MVP hides still demand a real login.
 */

// No login helper on purpose: these tests must work without a session.
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3102';

test('the app opens straight into Analytics, with no login', async ({ page }) => {
  await page.goto(BASE);
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.getByRole('heading', { name: 'Critical Cases Analytics' })).toBeVisible();
});

test('only Analytics and Import WhatsApp Data are in the navigation', async ({ page }) => {
  await page.goto(`${BASE}/analytics`);
  const nav = page.getByRole('navigation', { name: 'Main', exact: true });
  await expect(nav.getByRole('link')).toHaveCount(2);
  await expect(nav.getByRole('link', { name: 'Analytics' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Import WhatsApp Data' })).toBeVisible();
  // The product screens are hidden, not gone.
  for (const gone of ['Dashboard', 'Critical Cases', 'Report Case', 'Users']) {
    await expect(nav.getByRole('link', { name: gone })).toHaveCount(0);
  }
});

test('the WhatsApp importer is reachable and explains itself', async ({ page }) => {
  await page.goto(`${BASE}/admin/import-whatsapp`);
  await expect(page.getByRole('heading', { name: /Import WhatsApp/ })).toBeVisible();
  await expect(page.getByText(/Export chat/i).first()).toBeVisible();
  await expect(page.locator('input[type="file"]')).toBeVisible();
});

test('the pages the MVP hides still require a session', async ({ page }) => {
  for (const path of ['/cases', '/cases/new', '/admin/users', '/profile', '/dashboard']) {
    await page.goto(`${BASE}${path}`);
    await expect(page).toHaveURL(/\/login/);
  }
});

test('signing in still works while the MVP is on', async ({ page }) => {
  await page.goto(`${BASE}/login`);
  // The login form is untouched; a wrong password is still refused, and the message does not say
  // whether the username exists.
  await page.getByLabel('Username').fill(`e2e.nobody.${RUN}`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Login' }).click();
  // The page also has a notifications live region, so this is not the only alert on screen.
  await expect(page.getByRole('alert').first()).toContainText(/invalid username or password/i);
});

test('the dashboard shows its numbers and a working Case Explorer', async ({ page }) => {
  await page.goto(`${BASE}/analytics`);
  await expect(page.getByText('Total Critical Cases')).toBeVisible();
  // "Needs Review" is both a headline number and a card title.
  await expect(page.getByText('Needs Review').first()).toBeVisible();
  // The explorer is a labelled section, not a heading.
  await expect(page.getByRole('region', { name: 'Case Explorer' })).toBeVisible();

  // A filter narrows the list and can be removed again.
  const search = page.getByPlaceholder(/Case code, description/);
  await search.fill('zzzz-no-such-case');
  await expect(page.getByText('No cases match these filters.')).toBeVisible();
  await search.fill('');
  // Clearing the search brings the rows back.
  await expect(page.getByRole('region', { name: 'Case Explorer' }).getByRole('table')).toBeVisible();
});

test('the dashboard fits a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/analytics`);
  await expect(page.getByRole('heading', { name: 'Critical Cases Analytics' })).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/analytics-mvp-mobile.png', fullPage: true });
});