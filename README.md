# Florzy Critical Case Management

> **This deployment currently runs the temporary "Analytics MVP" described below.** The full product
> underneath it is intact - every route, screen and script is still in the repository.

Internal web app for Florzy's tile business. Salespeople report **critical supply cases** (a tile is out of stock, the wrong shade, delayed, damaged, too expensive…), the **Supply team** works on them, and everyone can see a case's status and history. It replaces the WhatsApp group "Florzy – Critical supply cases"; the group's history (Apr–Sep 2026) was imported as 114 historical cases.

## Analytics MVP (temporary)

> ⚠️ **Authentication is bypassed while this is on. Restore it before anyone outside the team can
> reach the site** - see [Restoring the full product](#restoring-the-full-product) below.

Right now the app presents one product area: the **Critical Cases Analytics dashboard**, opened at
`/analytics`, plus **Import WhatsApp Data** for getting the chat history in.

**What is on screen**

- **Overview** - total, open, resolved % and *Needs Review*, each against the previous period.
- **Trends** - cases reported per day/week/month. Hover or select a column for its count; select it
  to list exactly those cases.
- **Where cases stand**, **Top Critical Issues**, **Most Problematic Tiles**, **Reporting Patterns**
  (by person and by month), **Cases Resolved By** and **Vendors**.
- **Needs Review** - what the import could not read confidently, broken down by reason.
- **Case Explorer** - the read-only list of cases behind any of the above, with search, filters and
  pagination. Every row opens the case, which keeps the original WhatsApp messages.

**Every number links to the cases behind it.** There is no metric on the page that is a dead end,
and nothing on it can create, edit, assign or resolve a case.

**What was not changed**

- Nothing was deleted. Dashboard, Cases, Report Case, Users, Profile, Password and Notifications are
  all still routed and still work - they are only hidden from the navigation.
- `/admin/analytics` renders the **same** dashboard component as `/analytics`, not a second copy.
- No database migration was needed: `source`, `needs_review`, `review_reasons`, `source_messages`,
  `import_hash`, `case_events` and `case_tiles` already existed.
- The existing analytics queries and chart are the ones being shown; the drilldown is layered on top
  of them rather than replacing them.

### Importing the WhatsApp history

`/admin/import-whatsapp` takes the `.txt` from WhatsApp's **Export chat** (with or without media,
Android or iOS).

- **Idempotent.** Each case is keyed by a SHA-256 of the message *date + time + sender + text*,
  written to the unique `critical_cases.import_hash`. Exports overlap heavily - re-uploading the same
  file, or one that already contains imported history, inserts nothing. Nothing is keyed on a row
  number, an array index or the upload time.
- **Insert only.** Rows are never updated or deleted, and are written with
  `source = 'WHATSAPP_HISTORICAL'` so they stay distinguishable from app-created cases.
- **Nothing is guessed.** A field the message does not state stays null and the case is flagged
  `needs_review` with a reason (no tile number, unreadable reference, unknown issue type, unknown
  sender, no status in the message). Flagged cases stay in the analytics and stay reviewable.
- Reuses the existing spreadsheet import's normalisers and tile facts, so a chat message and a
  sheet row are read the same way.

### Restoring the full product

Two environment variables, both documented in `src/lib/mvp.ts`:

1. **Navigation** - set `ANALYTICS_MVP=false`. This brings back the full navigation, the "Report
   Case" button and the notification bell, and makes `/` and `/dashboard` lead to the operational
   Dashboard again. Nothing to change in code: `src/app/page.tsx`, `src/app/(app)/dashboard/page.tsx`
   and `src/app/login/actions.ts` all read the flag, and the Dashboard itself is still intact in
   `src/app/(app)/dashboard/dashboard-view.tsx`.
2. **Authentication** - set `ANALYTICS_MVP_BYPASS_AUTH=false`. This puts the login redirect back in
   `src/proxy.ts` and makes the pages require a session again. The bypass is scoped to the analytics
   routes, so hidden pages already demanded a session; only the dashboard and the importer are open.

The end-to-end suite already runs this way: the `flow` project sets both flags to `false`, so the full
product stays covered, while the `analytics-mvp` project leaves them on to cover the MVP.

The live site sets them explicitly in `wrangler.jsonc` rather than relying on the defaults — with both
unset the auth bypass falls back to being **on**, which would leave the WhatsApp importer open to the
internet. It is currently deployed that way on purpose (internal use): to put login back, set
`ANALYTICS_MVP_BYPASS_AUTH` to `false` in `wrangler.jsonc` and redeploy.

## Features

- **Login** with username + password; first-time users can **create an account**.
- **Dashboard**: my open / in-progress / resolved counters, recent cases, quick "Report Critical Case".
- **Report a case** in under a minute: search a tile → pick the problem → details → submit. "Tile not found" is supported (no fake tiles are created).
- **My Cases**: server-side search, status filter, pagination. Managers, admins and the Supply team can switch to **All cases**.
- **Case detail** with a timeline (who did what, when).
- **Supply team** (any team whose name contains "Supply") can **start, resolve, close and reopen** cases, with a required note for resolve/close.
- **Admin → Users**: create logins, set role and team, deactivate, reset passwords.
- **Admin → Analytics**: critical-case trends, breakdowns and the Case Explorer (see above).
- Historical WhatsApp cases are shown read-only, with their original messages.

## Tech stack

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind CSS 4 · shadcn/ui · Drizzle ORM · PostgreSQL on **Neon** · Zod · jose (signed session cookies) · Playwright (e2e).

## Project layout

```
src/
  app/
    login/  signup/  account/password/     public auth pages, change password
    (app)/                                 signed-in area (header + nav)
      analytics/                           the MVP landing page: Critical Cases Analytics
      admin/analytics/                     same dashboard component, kept for the restore
      admin/import-whatsapp/               WhatsApp TXT ingestion
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
| `CASE_ALERT_EMAILS` | Extra comma-separated addresses that get every new-case alert, on top of the Supply team's profile emails |
| `EMAIL_FROM` | Optional sender display, default `Florzy Critical Cases <SMTP_USER>`. Google only allows the mailbox's own address or its aliases |
| `STORAGE_ENDPOINT` / `STORAGE_REGION` / `STORAGE_BUCKET` | Object storage for case photos (Neon object storage, S3-compatible; bucket `case-photos`, private) |
| `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | Storage credential with read+write scope. Without the `STORAGE_*` settings photo uploads are refused with a clear message |
| `APP_URL` | Public address of the app, used for the "Open the case" link in emails |
| `ANALYTICS_MVP` | **Temporary.** `true` (default) shows only Analytics + the WhatsApp importer in the navigation, and sends `/` and `/dashboard` to `/analytics`. Set to `false` to restore the full product |
| `ANALYTICS_MVP_BYPASS_AUTH` | **Temporary.** `true` opens `/analytics` and the WhatsApp importer without signing in. Unset defaults to on while the MVP is on. Set to `false` to restore the login redirect - do this before the site is reachable by anyone else |

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

- **While the Analytics MVP bypass is on, `/analytics` and `/admin/import-whatsapp` do not require a
  session** - including the WhatsApp import, which writes. The bypass is scoped to those two routes
  and the hidden pages still require a real session. Turn it off with
  `ANALYTICS_MVP_BYPASS_AUTH=false` before exposing the site. With `ANALYTICS_MVP=false` the
  operational screens come back but still go through the normal login redirect.
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

Every case a salesperson submits sends one email to **every active Supply-team member who has an email on their profile** (set on **Profile & email** in the user menu, or by an admin on the Users page, which marks who gets alerts), plus any fixed addresses in `CASE_ALERT_EMAILS`. It goes out from our own mailbox over SMTP (`src/lib/smtp.ts`, a small client on `node:tls` that runs on Workers, where mail libraries such as nodemailer don't): case code, issue, severity, tile, quantities, description and a link to the case. High/Critical cases are flagged in the subject. The email is sent after the response (`after()`), so it never slows down the form; a failed send is logged and never affects the saved case. `npm run email:test` sends a sample alert to check the setup. Browser tests always run with alerts off.

### Item sheet (tile search) and tile details

The report form searches the **item sheet**, a Google Sheet read live as CSV (`SKU_SHEET_CSV_URL`); it is never copied into the database. Each server instance keeps the parsed sheet in memory for 15 minutes and refreshes it in the background, keeping the last good copy if Google can't be reached, so sheet edits show up within 15 minutes. Columns are found by header name: **Florzy Code** and **Sku Name** are required; Web Status, Vendor Name, Dimension (size), Finish, Material Type (body), Thickness and an optional Colour column are used when present. A renamed required column gives a clear error. Search matches every word against code, name, vendor, size, finish and body: exact code first, then codes starting with the query; discontinued items last.

Every report requires the tile's **colour, size, finish and body** (`tile_color`, `tile_size`, `tile_finish`, `tile_body`). Picking an item fills size, finish and body from the sheet (still editable); colour is typed unless the sheet gets a Colour column. With "Tile not found" they are typed, with suggestions from the sheet's own values. The case keeps a snapshot of the picked item (code in `requested_tile_no`, name, vendor) so it still shows what was reported after the sheet changes; if a tile record with the same code exists from the WhatsApp history, the case is linked to it. The sheet must stay shared as "anyone with the link can view"; restricting it stops the search (the form then offers "Tile not found"). Browser tests read `e2e/fixtures/skus.csv` instead (`SKU_SHEET_FILE`).

### Notifications

Every notification shows in the app (the bell in the header, with an unread count checked every 30 seconds, and the **Notifications** page) and is emailed to recipients who have an email on their profile, one email per person. Who hears what (`src/lib/notify-rules.ts`, unit-tested):

| Event | Recipients |
|---|---|
| New case | Supply team, plus the Listing team when the tile isn't in the item sheet (in-app only: the detailed new-case email already goes out) |
| Message | Everyone involved in the case except the sender; if nobody from Supply/admin is involved yet, the whole Supply team, plus the Listing team while the tile still needs listing |
| Status change | Reporter and assignee, except whoever changed it |
| Item listed | Reporter and assignee |

Notifications are stored in `notifications` and written after the response (`after()`), so they never slow down or break the action. Opening a case marks its notifications read.

### Case messages

Every app case has a **Messages** conversation. The salesperson who reported it and anyone who sees all cases (Supply team, managers, admins) can post as often as they need, also after the case is resolved or closed; historical WhatsApp cases have none. Messages are `COMMENT` events in `case_events` (max 2000 characters). The notes written with the report and with each status change (Started working, Resolved, Closed, Reopened) appear in the same conversation with a small label, so the whole exchange reads in one place; the Timeline stays a status history. An open case page checks for new messages every 20 seconds while the tab is visible.

### Case photos

The report form has an optional **Photos** step (up to 6). The browser shrinks each photo to at most 1600 px (JPEG) before upload, so a phone photo is a few hundred KB. The server re-checks everything: at most 6 photos, 5 MB each, and the type is read from the file's bytes (JPG, PNG, WebP, HEIC; never SVG or anything else), not from its name. Photos are uploaded to a **private** bucket first and recorded in `case_attachments` in the same transaction as the case; if the case can't be saved, the uploaded photos are deleted again. They are served only through `/api/attachments/[id]`, which applies the same rule as the case page (your own cases, or all cases for Supply/Admin) and answers 404 otherwise. The new-case email attaches the photos (up to 15 MB in total; the email says when some are only on the case). **Adding photos later:** the case page has an **Add photos** control for whoever can see the case (the reporter, the Supply team, managers and admins), on app cases only; historical WhatsApp cases stay as imported. A case holds at most 12 photos; the limit is re-checked under a row lock when saving. Each upload is recorded in the timeline ("2 photos added", an `UPDATED` event with `photos_added`). Browser tests store their photos under the `e2e/` prefix.

## Deployment (Cloudflare Workers)

The app runs on Cloudflare Workers through [OpenNext](https://opennext.js.org/cloudflare) (`wrangler.jsonc`, `open-next.config.ts`). Workers cannot reuse a database socket across requests, so on Workers `src/db/index.ts` opens a short-lived pool per request; Node keeps one shared pool.

```bash
npx wrangler login                       # once
npm run cf:preview                       # build + run the Worker locally (reads .dev.vars)
npm run cf:deploy                        # build + deploy
```

Secrets (`DATABASE_URL`, `SESSION_SECRET`, `SMTP_USER`, `SMTP_PASS`, `CASE_ALERT_EMAILS`, `STORAGE_*`) live in Cloudflare, set with `npx wrangler secret put NAME`; never in `wrangler.jsonc`. `APP_URL` is a plain var in `wrangler.jsonc`. To run the browser tests against a running Worker: `E2E_BASE_URL=http://localhost:8787 npx playwright test --project=flow` (point `.dev.vars` at the test branch first).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Develop / build / run production |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (validation, permissions, passwords, sessions, normalisers) |
| `npm run test:e2e` | Browser tests (see below) |
| `npm run check:sql` | Requests every analytics route against `.env.e2e` and fails on a SQL error. Run this after touching a query - it catches broken SQL in seconds instead of as a 500 in the browser |
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

Two projects, one build:

- `flow` runs the **full product** - `playwright.config.ts` starts its server with
  `ANALYTICS_MVP=false` and `ANALYTICS_MVP_BYPASS_AUTH=false`, so the existing suite keeps testing the
  product that is being temporarily hidden.
- `analytics-mvp` starts a second server with both flags on and covers the MVP itself: opening
  `/analytics` without a session, only two navigation entries, the importer page, and the fact that
  the hidden screens still demand a login.

Use `--project=flow` (or `--project=analytics-mvp`) to run just one.

## Known limitations

- No photo uploads for damaged/quality cases yet (no file storage configured).
- Lockout is per account, so repeated wrong guesses can lock a colleague out until an admin resets them.
- Neon's free tier pauses idle databases; the first request after a pause can take a few seconds.
