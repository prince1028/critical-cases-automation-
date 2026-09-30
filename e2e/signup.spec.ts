import { expect, test } from '@playwright/test';
import type pg from 'pg';
import { connectDb, createTestUser, login, PASSWORD, RUN } from './helpers';

// Runs on the Neon e2e-test branch.
const BASE = 'http://localhost:3100';
const NAME = `E2E Signup ${RUN}`;
const USERNAME = `e2e.signup.${RUN}`;

let db: pg.Client;
const q = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
test.beforeAll(async () => {
  db = await connectDb();
});
test.afterAll(async () => db?.end());
test.describe.configure({ mode: 'serial' });

async function fill(page: import('@playwright/test').Page, v: Record<string, string>) {
  await page.getByLabel('Full name').fill(v.name ?? '');
  await page.getByLabel('Username').fill(v.username ?? '');
  await page.getByLabel('Team').fill(v.team ?? '');
  await page.getByLabel('Password', { exact: true }).fill(v.password ?? '');
  await page.getByLabel('Confirm password').fill(v.confirm ?? v.password ?? '');
  await page.getByRole('button', { name: 'Create account' }).click();
}

test('first-time user creates an account from the login page and lands on the dashboard', async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page).toHaveURL(/\/signup$/);

  // Validation errors
  await fill(page, {});
  await expect(page.getByText('Enter the full name')).toBeVisible();
  await fill(page, { name: NAME, username: USERNAME, team: 'Supply', password: PASSWORD, confirm: 'nope-nope-1' });
  await expect(page.getByText('Supply team access is given by an admin')).toBeVisible();
  await expect(page.getByText('Passwords do not match')).toBeVisible();
  await expect(page.getByLabel('Full name')).toHaveValue(NAME); // kept after errors
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(''); // never echoed

  // Success
  await fill(page, { name: NAME, username: USERNAME.toUpperCase(), team: 'Sales', password: PASSWORD });
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: `Welcome, ${NAME}` })).toBeVisible();

  const [u] = await q<{ role: string; team: string; username: string; password_hash: string; must_change_password: boolean }>(
    'SELECT role, team, username, password_hash, must_change_password FROM users WHERE name = $1',
    [NAME],
  );
  expect(u).toMatchObject({ role: 'SALES', team: 'Sales', username: USERNAME, must_change_password: false });
  expect(u.password_hash.startsWith('scrypt$')).toBe(true);
  expect(u.password_hash).not.toContain(PASSWORD);

  // Can log out and back in with the new credentials; /signup redirects signed-in users
  await page.goto(`${BASE}/signup`);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: 'Logout' }).click();
  await login(page, USERNAME, PASSWORD, BASE);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('signup refuses a taken username and an existing employee name', async ({ page }) => {
  const existingName = `E2E Existing ${RUN}`;
  await createTestUser(db, { name: existingName, username: `e2e.existing.${RUN}`, team: 'Sales' });

  await page.goto(`${BASE}/signup`);
  await fill(page, { name: `E2E Other ${RUN}`, username: USERNAME, team: 'Sales', password: PASSWORD });
  await expect(page.getByRole('main').getByText('That username is already taken')).toBeVisible();

  await fill(page, { name: existingName.toUpperCase(), username: `e2e.new.${RUN}`, team: 'Sales', password: PASSWORD });
  await expect(page.getByRole('main').getByText('An account for this name already exists')).toBeVisible();
  const rows = await q('SELECT 1 FROM users WHERE username = $1', [`e2e.new.${RUN}`]);
  expect(rows).toHaveLength(0);
});
