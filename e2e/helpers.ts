import { expect, type Browser, type Page } from '@playwright/test';
import pg from 'pg';
import { hashPassword } from '../src/lib/password';

/** Test users live only on the Neon e2e branch (see playwright.config.ts). */
export const RUN = Date.now().toString(36);
export const PASSWORD = 'Tiles-2026-ok';

/** Connects to the e2e branch, retrying while a scaled-to-zero Neon compute wakes up. */
export async function connectDb() {
  for (let attempt = 1; ; attempt++) {
    const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL, connectionTimeoutMillis: 15_000 });
    try {
      await db.connect();
      await db.query('SELECT 1');
      return db;
    } catch (e) {
      await db.end().catch(() => {});
      if (attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 2_000 * attempt));
    }
  }
}

export async function createTestUser(
  db: pg.Client,
  u: { name: string; username: string; team: string; role?: 'SALES' | 'MANAGER' | 'ADMIN'; password?: string; mustChange?: boolean },
) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO users (name, username, team, role, password_hash, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [u.name, u.username.toLowerCase(), u.team, u.role ?? 'SALES', await hashPassword(u.password ?? PASSWORD), u.mustChange ?? false],
  );
  return rows[0].id;
}

export async function login(page: Page, username: string, password = PASSWORD, base = '') {
  await page.goto(`${base}/login`);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
}

export async function loginAs(browser: Browser, username: string, base: string, password = PASSWORD): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await login(page, username, password, base);
  await expect(page).toHaveURL(/\/dashboard$/);
  return page;
}
