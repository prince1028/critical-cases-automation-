import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a Neon *branch* (a copy of production) configured in .env.e2e,
 * never against the production database. Run `npm run build` first.
 */
function readEnv(file: string): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    );
  } catch {
    return {};
  }
}
const e2e = readEnv('.env.e2e');
const prod = readEnv('.env');
const host = (u?: string) => u?.match(/@([^/]+)/)?.[1];
if (!e2e.DATABASE_URL) throw new Error('.env.e2e with DATABASE_URL (a Neon test branch) is required for e2e tests');
if (host(e2e.DATABASE_URL) === host(prod.DATABASE_URL)) {
  throw new Error('Refusing to run e2e tests: .env.e2e points at the production database endpoint');
}
process.env.E2E_DATABASE_URL = e2e.DATABASE_URL;

// SMTP_PASS is blanked so test runs never send real emails (Next would otherwise load it from .env).
const common = { SESSION_SECRET: e2e.SESSION_SECRET, NODE_ENV: 'production', SMTP_PASS: '' };
process.env.SESSION_SECRET = e2e.SESSION_SECRET; // lets tests sign cookies for the db-down server

/** Set E2E_BASE_URL to test an already-running server (e.g. the Cloudflare Worker via `npm run cf:preview`) instead of starting `next start`. */
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'flow', testMatch: /(flow|supply|auth-admin|signup)\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: external ?? 'http://localhost:3100' } },
    { name: 'db-down', testMatch: /db-down\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3101' } },
  ],
  webServer: external ? [] : [
    {
      command: 'npx next start -p 3100',
      url: 'http://localhost:3100/login',
      env: { ...common, DATABASE_URL: e2e.DATABASE_URL },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Same build, unreachable database: exercises the database-failure paths.
      command: 'npx next start -p 3101',
      url: 'http://localhost:3101/login',
      env: { ...common, DATABASE_URL: 'postgresql://nobody:nothing@127.0.0.1:9/nodb?connect_timeout=2' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
