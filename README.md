# Florzy Critical Case Management

Internal web app for Florzy's tile business. Salespeople report **critical supply cases** (a tile is out of stock, the wrong shade, delayed, damaged, too expensive…), the **Supply team** works on them, and everyone can see a case's status and history. It replaces the WhatsApp group "Florzy – Critical supply cases"; the group's history (Apr–Sep 2026) was imported as 114 historical cases.

## Features

- **Login** with username + password; first-time users can **create an account**.
- **Dashboard**: my open / in-progress / resolved counters, recent cases, quick "Report Critical Case".
- **Report a case** in under a minute: search a tile → pick the problem → details → submit. "Tile not found" is supported (no fake tiles are created).
- **My Cases**: server-side search, status filter, pagination. Managers, admins and the Supply team can switch to **All cases**.
- **Case detail** with a timeline (who did what, when).
- **Supply team** (any team whose name contains "Supply") can **start, resolve, close and reopen** cases, with a required note for resolve/close.
- **Admin → Users**: create logins, set role and team, deactivate, reset passwords.
- Historical WhatsApp cases are shown read-only, with their original messages.

## Tech stack

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind CSS 4 · shadcn/ui · Drizzle ORM · PostgreSQL on **Neon** · Zod · jose (signed session cookies) · Playwright (e2e).

## Project layout

```
src/
  app/
    login/  signup/  account/password/     public auth pages, change password
    (app)/                                 signed-in area (header + nav)
      dashboard/  cases/  cases/new/  cases/[id]/  admin/users/
    api/tiles/                             tile search (signed-in only)
    api/session/clear/                     clears a revoked session cookie
  components/                              app components + shadcn/ui (components/ui)
  db/schema.ts, db/index.ts                Drizzle schema and the single DB client
  lib/                                     validation (Zod), sessions, permissions, passwords, formatting
  server/                                  server-only data access (cases, tiles, users, auth)
  import/                                  historical-import helpers (tile parsing, tile facts)
  proxy.ts                                 optimistic auth redirect (Next 16 "proxy", formerly middleware)
drizzle/                                   SQL migrations (never edited by hand after being applied)
scripts/                                   CLI: DB check, historical import, verification, set a login
e2e/                                       Playwright end-to-end tests
```

## Getting started

Requirements: Node.js 20+ and access to the Neon project `florzy-critical-cases`.

```bash
npm install
cp .env.example .env        # then fill in the values below
npm run db:migrate          # applies any pending migrations (additive; never drops data)
npm run dev                 # http://localhost:3000
```

### Environment variables

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string, with `sslmode=verify-full` |
| `SESSION_SECRET` | Random string, 32+ characters. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `SMTP_USER` / `SMTP_PASS` | Mailbox that sends new-case alerts, and its app password (Google: myaccount.google.com/apppasswords). Leave `SMTP_PASS` empty to turn alerts off |
| `SMTP_HOST` / `SMTP_PORT` | Mail server, default `smtp.gmail.com` / `465` (implicit TLS) |
| `CASE_ALERT_EMAILS` | Comma-separated addresses that get an email for every new case |
| `EMAIL_FROM` | Optional sender display, default `Florzy Critical Cases <SMTP_USER>`. Google only allows the mailbox's own address or its aliases |
| `APP_URL` | Public address of the app, used for the "Open the case" link in emails |

`.env`, `.env.*` (except `.env.example`), `data/` and `output/` are git-ignored. Never commit credentials.

### First admin

Run in **your own terminal** (the password is typed in a hidden prompt, never shown or logged):

```bash
npm run user:set-login -- --name "Full Name" --username yourname --role ADMIN
```

Everyone else either uses **Create an account** on the login page or gets a login from an admin (**Users** page).

## Roles and permissions

| Who | Can |
|---|---|
| **Sales** | Report cases; see and track their own cases |
| **Manager** | Also browse all cases |
| **Admin** | Everything, including the Users page |
| **Supply team** (team name contains "Supply") | Browse all cases; start, resolve, close and reopen app cases |

- Self-registered accounts are always **Sales** and cannot choose a Supply team; an admin assigns that.
- Signup refuses a name that already belongs to an employee record (an admin gives that person a login instead).
- Admins can't remove their own admin role or deactivate themselves; there is always at least one active admin.

## Security

- Passwords are stored only as **scrypt** hashes (`src/lib/password.ts`); temporary passwords are shown to the admin once.
- Sessions are signed, `httpOnly`, `SameSite=Lax` cookies holding only the user id and a session version. Every page and action re-checks the user in the database; password change/reset and deactivation bump the version, signing the user out everywhere.
- 5 wrong passwords lock an account for 15 minutes (an admin reset unlocks it). Unknown usernames and wrong passwords get the same message.
- All database access is server-side; `reported_by` and the acting user always come from the session, never from the browser. Every mutation is validated with Zod on the server.

## Case workflow

`NEW → IN_PROGRESS → RESOLVED`, or `→ CANCELLED` (closed without a resolution); resolved/cancelled cases can be reopened. Each change writes a `case_events` row (`STATUS_CHANGED`, with old and new values and the note). New cases get codes continuing the historical series (`CC-115`, `CC-116`, …) from the `critical_case_code_seq` sequence; a failed save can leave a gap in the numbers.

## Data

| Table | Purpose |
|---|---|
| `tiles` | Tile master. `tile_code` is the business identifier (text; leading zeros and letters kept) |
| `critical_cases` | Cases. `source` = `WHATSAPP_HISTORICAL` (imported) or `APP` |
| `case_tiles` | All tiles linked to a case (a case can name several) |
| `case_events` | Audit trail (`HISTORICAL_IMPORT`, `CREATED`, `STATUS_CHANGED`, …) |
| `users` | Employees: name, username, team, role, password hash, login state |

Migrations (in `drizzle/`):
`0000` initial schema · `0001` rename `tile_no` → `tile_code` · `0002` `users.team` + case-code sequence · `0003` login columns.

**Historical data rules:** the 114 imported cases are never modified by the app (status changes are only allowed on `APP` cases). Their original WhatsApp messages are kept in `source_messages`. Tiles are only created for confirmed Florzy/vendor codes; competitor codes (MyTyles, Material Depot, Trove…) are kept as references, not tiles.

Re-running the historical import is safe (idempotent via `import_hash`):
```bash
npm run import:critical-cases -- ./data/Florzy_Critical_Cases_v2.xlsx
npm run db:verify
```

## New-case email alerts

Every case a salesperson submits sends one email to `CASE_ALERT_EMAILS`, from our own mailbox over SMTP (`src/lib/smtp.ts`, a small client on `node:tls` that runs on Workers, where mail libraries such as nodemailer don't): case code, issue, severity, tile, quantities, description and a link to the case. High/Critical cases are flagged in the subject. The email is sent after the response (`after()`), so it never slows down the form; a failed send is logged and never affects the saved case. `npm run email:test` sends a sample alert to check the setup. Browser tests always run with alerts off.

## Deployment (Cloudflare Workers)

The app runs on Cloudflare Workers through [OpenNext](https://opennext.js.org/cloudflare) (`wrangler.jsonc`, `open-next.config.ts`). Workers cannot reuse a database socket across requests, so on Workers `src/db/index.ts` opens a short-lived pool per request; Node keeps one shared pool.

```bash
npx wrangler login                       # once
npm run cf:preview                       # build + run the Worker locally (reads .dev.vars)
npm run cf:deploy                        # build + deploy
```

Secrets (`DATABASE_URL`, `SESSION_SECRET`, `SMTP_USER`, `SMTP_PASS`, `CASE_ALERT_EMAILS`) live in Cloudflare, set with `npx wrangler secret put NAME`; never in `wrangler.jsonc`. `APP_URL` is a plain var in `wrangler.jsonc`. To run the browser tests against a running Worker: `E2E_BASE_URL=http://localhost:8787 npx playwright test --project=flow` (point `.dev.vars` at the test branch first).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Develop / build / run production |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (validation, permissions, passwords, sessions, normalisers) |
| `npm run test:e2e` | Browser tests (see below) |
| `npm run db:check` | `SELECT NOW()` against the database |
| `npm run db:generate` / `npm run db:migrate` | Create / apply Drizzle migrations |
| `npm run db:studio` | Browse the database |
| `npm run user:set-login` | Give someone a username + password from the terminal |
| `npm run email:test` | Send a sample new-case alert to `CASE_ALERT_EMAILS` |
| `npm run cf:preview` / `npm run cf:deploy` | Run the Cloudflare Worker locally / deploy it |

## End-to-end tests

The Playwright tests run against a **Neon branch** (a copy of production), never production itself; `playwright.config.ts` refuses to run if the test URL points at the production endpoint.

1. Create a branch and put its connection string in `.env.e2e` (plus the same `SESSION_SECRET`):
   `neonctl branches create --project-id dark-leaf-13748022 --name e2e-test`
2. Apply migrations to it: `DATABASE_URL=<branch url> npm run db:migrate`
3. `npm run build && npm run test:e2e`

They cover login/lockout/signup, the full report → Neon → My Cases → detail flow, the Supply resolve/close/reopen workflow, the admin Users page, mobile layouts and database-down error handling.

## Known limitations

- No photo uploads for damaged/quality cases yet (no file storage configured).
- Lockout is per account, so repeated wrong guesses can lock a colleague out until an admin resets them.
- Neon's free tier pauses idle databases; the first request after a pause can take a few seconds.
