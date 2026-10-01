import { expect, test } from '@playwright/test';
import type pg from 'pg';
import { connectDb, createTestUser, login, loginAs, PASSWORD, RUN } from './helpers';

// Runs on the Neon e2e-test branch.
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const ADMIN = { name: `E2E Admin2 ${RUN}`, username: `e2e.admin2.${RUN}` };
const SALES = { name: `E2E Plain ${RUN}`, username: `e2e.plain.${RUN}` };
const NEWBIE = { name: `E2E Newbie ${RUN}`, username: `e2e.newbie.${RUN}` };

let db: pg.Client;
const q = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

test.beforeAll(async () => {
  db = await connectDb();
  await createTestUser(db, { ...ADMIN, team: 'Operations', role: 'ADMIN' });
  await createTestUser(db, { ...SALES, team: 'Sales' });
});
test.afterAll(async () => db?.end());
test.describe.configure({ mode: 'serial' });

test('non-admins cannot see or open the Users page', async ({ browser }) => {
  const page = await loginAs(browser, SALES.username, BASE);
  await expect(page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Users' })).toHaveCount(0);
  await page.goto(`${BASE}/admin/users`);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('admin creates a login; the employee must set a password before using the app', async ({ browser }) => {
  const admin = await loginAs(browser, ADMIN.username, BASE);
  await admin.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Users' }).click();
  await expect(admin.getByRole('heading', { name: 'Users & roles' })).toBeVisible();

  // Validation, then a successful create
  await admin.getByRole('button', { name: 'Add user' }).click();
  const dialog = admin.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Create login' }).click();
  await expect(dialog.getByText('Enter the full name')).toBeVisible();
  await dialog.getByLabel('Full name').fill(NEWBIE.name);
  await dialog.getByLabel('Username').fill(NEWBIE.username.toUpperCase());
  await dialog.getByLabel('Team').fill('Sales');
  await dialog.getByRole('button', { name: 'Create login' }).click();
  const temp = (await dialog.getByTestId('temp-password').textContent())!.trim();
  expect(temp).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(admin.getByRole('cell', { name: NEWBIE.username, exact: true })).toBeVisible();

  const [row] = await q<{ password_hash: string; must_change_password: boolean; role: string }>(
    'SELECT password_hash, must_change_password, role FROM users WHERE username = $1',
    [NEWBIE.username],
  );
  expect(row.password_hash.startsWith('scrypt$')).toBe(true);
  expect(row.password_hash).not.toContain(temp); // never stored in plain text
  expect(row).toMatchObject({ must_change_password: true, role: 'SALES' });

  // Duplicate username is rejected
  await admin.getByRole('button', { name: 'Add user' }).click();
  await admin.getByRole('dialog').getByLabel('Full name').fill('Someone Else');
  await admin.getByRole('dialog').getByLabel('Username').fill(NEWBIE.username);
  await admin.getByRole('dialog').getByLabel('Team').fill('Sales');
  await admin.getByRole('dialog').getByRole('button', { name: 'Create login' }).click();
  await expect(admin.getByRole('dialog').getByText('That username is already taken')).toBeVisible();
  await admin.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  // Employee logs in with the temporary password -> forced to change it
  const emp = await (await browser.newContext()).newPage();
  await login(emp, NEWBIE.username, temp, BASE);
  await expect(emp).toHaveURL(/\/account\/password$/);
  await expect(emp.getByRole('heading', { name: 'Set your password' })).toBeVisible();
  await emp.goto(`${BASE}/dashboard`);
  await expect(emp).toHaveURL(/\/account\/password$/); // can't skip it

  await emp.getByLabel('Current (or temporary) password').fill('not-it-123');
  await emp.getByLabel('New password', { exact: true }).fill('short');
  await emp.getByLabel('Confirm new password').fill('short');
  await emp.getByRole('button', { name: 'Save password' }).click();
  await expect(emp.getByText('Use at least 8 characters')).toBeVisible();

  await emp.getByLabel('Current (or temporary) password').fill('not-it-123');
  await emp.getByLabel('New password', { exact: true }).fill(PASSWORD);
  await emp.getByLabel('Confirm new password').fill(PASSWORD);
  await emp.getByRole('button', { name: 'Save password' }).click();
  await expect(emp.getByText('Current password is incorrect')).toBeVisible();

  await emp.getByLabel('Current (or temporary) password').fill(temp);
  await emp.getByLabel('New password', { exact: true }).fill(PASSWORD);
  await emp.getByLabel('Confirm new password').fill(PASSWORD);
  await emp.getByRole('button', { name: 'Save password' }).click();
  await expect(emp).toHaveURL(/\/dashboard/);
  await expect(emp.getByRole('heading', { name: `Welcome, ${NEWBIE.name}` })).toBeVisible();

  const [after] = await q<{ must_change_password: boolean; session_version: number }>(
    'SELECT must_change_password, session_version FROM users WHERE username = $1',
    [NEWBIE.username],
  );
  expect(after.must_change_password).toBe(false);
  expect(after.session_version).toBe(2);

  // Old temporary password no longer works; new one does
  const other = await (await browser.newContext()).newPage();
  await login(other, NEWBIE.username, temp, BASE);
  await expect(other.getByText('Invalid username or password.').first()).toBeVisible();
  await login(other, NEWBIE.username, PASSWORD, BASE);
  await expect(other).toHaveURL(/\/dashboard$/);
});

test('admin moves an employee to Supply: they can now resolve cases', async ({ browser }) => {
  const admin = await loginAs(browser, ADMIN.username, BASE);
  await admin.goto(`${BASE}/admin/users`);
  await admin.getByRole('button', { name: `Edit ${NEWBIE.name}` }).click();
  const dialog = admin.getByRole('dialog');
  await dialog.getByLabel('Team').fill('Supply');
  await dialog.getByRole('combobox', { name: 'Role' }).click();
  await admin.getByRole('option', { name: 'Manager' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  const row = admin.getByRole('row').filter({ hasText: NEWBIE.username });
  await expect(row.getByText('Case handler')).toBeVisible();
  await expect(row.getByText('Manager')).toBeVisible();
  const [u] = await q<{ team: string; role: string }>('SELECT team, role FROM users WHERE username = $1', [NEWBIE.username]);
  expect(u).toEqual({ team: 'Supply', role: 'MANAGER' });

  const emp = await loginAs(browser, NEWBIE.username, BASE);
  await expect(emp.getByText('Waiting for Supply team')).toBeVisible();
});

test('password reset signs the employee out; deactivation blocks login', async ({ browser }) => {
  const emp = await loginAs(browser, NEWBIE.username, BASE);
  const admin = await loginAs(browser, ADMIN.username, BASE);
  await admin.goto(`${BASE}/admin/users`);

  await admin.getByRole('button', { name: `Reset password for ${NEWBIE.name}` }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Reset password' }).click();
  const temp = (await admin.getByTestId('temp-password').textContent())!.trim();
  await admin.getByRole('dialog').getByRole('button', { name: 'Done' }).click();

  // Existing session is revoked immediately
  await emp.goto(`${BASE}/dashboard`);
  await expect(emp).toHaveURL(/\/login$/);
  await login(emp, NEWBIE.username, PASSWORD, BASE);
  await expect(emp.getByText('Invalid username or password.').first()).toBeVisible();
  await login(emp, NEWBIE.username, temp, BASE);
  await expect(emp).toHaveURL(/\/account\/password$/);

  // Deactivate
  await admin.getByRole('button', { name: `Edit ${NEWBIE.name}` }).click();
  await admin.getByRole('dialog').getByLabel('Active (can log in)').uncheck();
  await admin.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(admin.getByRole('dialog')).toBeHidden();
  await expect(admin.getByRole('row').filter({ hasText: NEWBIE.username }).getByText('Deactivated')).toBeVisible();

  await emp.goto(`${BASE}/account/password`);
  await expect(emp).toHaveURL(/\/login$/);
  await login(emp, NEWBIE.username, temp, BASE);
  await expect(emp.getByText('Invalid username or password.').first()).toBeVisible();
});

test('admin cannot demote or deactivate themselves', async ({ browser }) => {
  const admin = await loginAs(browser, ADMIN.username, BASE);
  await admin.goto(`${BASE}/admin/users`);
  await admin.getByRole('button', { name: `Edit ${ADMIN.name}` }).click();
  await expect(admin.getByRole('dialog').getByRole('combobox', { name: 'Role' })).toBeDisabled();
  await expect(admin.getByRole('dialog').getByLabel('Active (can log in)')).toBeDisabled();
});

test('account locks after 5 wrong passwords, even for the right password; admin reset unlocks', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  const failures = async () =>
    (await q<{ n: number }>('SELECT failed_login_attempts AS n FROM users WHERE username = $1', [SALES.username]))[0].n;
  const start = await failures();
  for (let i = 1; i <= 5; i++) {
    await login(page, SALES.username, `wrong-${i}-pass`, BASE);
    // Wait until the server has recorded this attempt before making the next one.
    await expect.poll(failures).toBe(start + i);
  }
  await login(page, SALES.username, PASSWORD, BASE);
  await expect(page.getByRole('alert').filter({ hasText: 'locked' })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  const admin = await loginAs(browser, ADMIN.username, BASE);
  await admin.goto(`${BASE}/admin/users`);
  await expect(admin.getByRole('row').filter({ hasText: SALES.username }).getByText('Locked')).toBeVisible();
  await admin.getByRole('button', { name: `Reset password for ${SALES.name}` }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Reset password' }).click();
  const temp = (await admin.getByTestId('temp-password').textContent())!.trim();
  await login(page, SALES.username, temp, BASE);
  await expect(page).toHaveURL(/\/account\/password$/);
});

test('any user can change their own password from the user menu', async ({ browser }) => {
  const name = `E2E Changer ${RUN}`;
  const username = `e2e.changer.${RUN}`;
  await createTestUser(db, { name, username, team: 'Sales' });
  const page = await loginAs(browser, username, BASE);
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: 'Change password' }).click();
  await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible();
  await page.getByLabel('Current (or temporary) password').fill(PASSWORD);
  await page.getByLabel('New password', { exact: true }).fill('Another-pass-9');
  await page.getByLabel('Confirm new password').fill('Another-pass-9');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`${BASE}/cases`); // still signed in on this device
  await expect(page.getByRole('heading', { name: 'My Cases' })).toBeVisible();
});
