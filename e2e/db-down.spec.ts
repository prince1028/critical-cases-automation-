import { expect, test } from '@playwright/test';

// This project runs the same build with an unreachable DATABASE_URL.

test('entry page still renders when the database is down, and shows a clear error on submit', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('Critical Case Management')).toBeVisible();
  await page.getByLabel('Username').fill('db.down.test');
  await page.getByLabel('Password').fill('Whatever-123');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not reach the database' })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('signed-in pages show the error screen (not a crash) when the database is down', async ({ page, context }) => {
  const { signSession } = await import('../src/lib/session-token');
  const token = await signSession({ userId: '00000000-0000-4000-8000-000000000000', v: 1 });
  await context.addCookies([{ name: 'florzy_session', value: token, url: 'http://localhost:3101' }]);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
