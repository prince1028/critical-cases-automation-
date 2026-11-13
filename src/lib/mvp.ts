/**
 * ============================================================================
 *  TEMPORARY - INTERNAL "CRITICAL CASES ANALYTICS" MVP
 * ============================================================================
 *
 *  While this flag is on, the application presents ONE product area:
 *  the Critical Cases Analytics dashboard (plus the WhatsApp import that feeds it).
 *  Every other page - Dashboard, Cases, Report Case, Users, Profile, Password,
 *  Notifications - still exists, is still routed and still works; it is only
 *  hidden from the navigation. Nothing was deleted. See README.md ("Analytics MVP").
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  !! AUTHENTICATION IS TEMPORARILY BYPASSED - RESTORE BEFORE PRODUCTION !!  │
 *  ─────────────────────────────────────────────────────────────────────────
 *
 *  While `authBypassEnabled()` is true the analytics pages resolve a
 *  read-only analytics viewer instead of requiring a signed-in employee, and
 *  `src/proxy.ts` stops redirecting to /login. The whole auth implementation
 *  is untouched and still used whenever a real session cookie is present:
 *
 *    src/proxy.ts        optimistic cookie check  (edit: re-enable the redirect)
 *    src/lib/dal.ts      getCurrentUser/requireUser/requireAdmin
 *    src/lib/session.ts  createSession/readSession/deleteSession
 *    src/lib/session-token.ts  signed cookie + session version
 *    src/server/auth.ts  authenticate(), lockout
 *    src/app/login/  src/app/signup/  src/app/account/password/
 *
 *  TO PRODUCTION: set ANALYTICS_MVP=false (restores the full navigation) and
 *  ANALYTICS_MVP_BYPASS_AUTH=false (restores the login redirect). Nothing else has to
 *  change; the login flow comes straight back.
 */

/**
 * Whether the app shows only the Analytics MVP. `true` hides the other product
 * areas from the navigation; their routes and code stay in the repository.
 *
 * Defaults to on. Set `ANALYTICS_MVP=false` in the environment to switch the full product
 * back on without a code change (this is how the end-to-end suite tests the restored product).
 *
 * SERVER ONLY. A client bundle has `process.env` substituted at build time, so reading this from a
 * "use client" module silently pins the value until the app is rebuilt. Server components (including
 * the layout and the proxy) read it directly; client components are handed it as a prop.
 */
export const ANALYTICS_MVP = !['0', 'false', 'off', 'no'].includes(
  (process.env.ANALYTICS_MVP ?? '').trim().toLowerCase(),
);

/** Analytics is the landing page of the MVP. */
export const ANALYTICS_ROUTE = '/analytics';

/** Where the old dashboard sends people now; the dashboard page itself is kept. */
export const LEGACY_DASHBOARD_ROUTE = '/dashboard';

/** Secondary route: the WhatsApp TXT ingestion layer that feeds the analytics. */
export const WHATSAPP_IMPORT_ROUTE = '/admin/import-whatsapp';

/**
 * Routes the temporary auth bypass covers: the analytics dashboard and the WhatsApp importer,
 * and nothing else. The pages the MVP hides keep requiring a real session even while the bypass is
 * on, so the bypass cannot be used to reach case data through a hidden route.
 *
 * `/` is included because it renders nothing at all - it only redirects to the analytics dashboard,
 * which is listed anyway - so letting it through is what makes the app open on Analytics instead of
 * the login page.
 */
export const MVP_BYPASS_PATHS = ['/', ANALYTICS_ROUTE, '/admin/analytics', WHATSAPP_IMPORT_ROUTE];

export interface MvpNavItem {
  href: string;
  label: string;
  short: string;
}

/**
 * The only visible navigation while ANALYTICS_MVP is on. Keep this list and
 * the `fullNav` below in sync: restoring the product is flipping the flag.
 */
export const ANALYTICS_MVP_NAV: MvpNavItem[] = [
  { href: ANALYTICS_ROUTE, label: 'Analytics', short: 'Analytics' },
  { href: WHATSAPP_IMPORT_ROUTE, label: 'Import WhatsApp Data', short: 'Import' },
];

/**
 * The complete navigation of the full product, preserved for the restore.
 * Icons live in components/app-header.tsx (this module must stay edge-safe).
 */
export const FULL_NAV: MvpNavItem[] = [
  { href: '/dashboard', label: 'Dashboard', short: 'Home' },
  { href: '/cases', label: 'Critical Cases', short: 'Cases' },
  { href: '/cases/new', label: 'Report Case', short: 'Report' },
  { href: '/admin/analytics', label: 'Analytics', short: 'Analytics' },
  { href: '/admin/users', label: 'Users', short: 'Users' },
];

/**
 * The navigation to render, honouring the MVP flag. Server only, for the reason above: the layout
 * resolves it and passes the result to the client header.
 */
export const visibleNav = (isAdmin: boolean): MvpNavItem[] => {
  if (!ANALYTICS_MVP) return FULL_NAV.filter((i) => isAdmin || !i.href.startsWith('/admin/'));
  return ANALYTICS_MVP_NAV;
};

/**
 * Whether the temporary auth bypass is active. Defaults to ON while the MVP is on,
 * so a fresh checkout opens straight into Analytics. Set the env var to "false"/"0"/"no"
 * to put the login flow back without touching any code.
 */
export function authBypassEnabled(): boolean {
  const raw = process.env.ANALYTICS_MVP_BYPASS_AUTH;
  if (raw === undefined || raw === '') return ANALYTICS_MVP;
  return !['0', 'false', 'off', 'no'].includes(raw.trim().toLowerCase());
}