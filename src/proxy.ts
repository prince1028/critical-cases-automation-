import { NextResponse, type NextRequest } from 'next/server';
import { ANALYTICS_MVP, ANALYTICS_ROUTE, authBypassEnabled, LEGACY_DASHBOARD_ROUTE, MVP_BYPASS_PATHS } from '@/lib/mvp';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session-token';

/** Where a signed-in user belongs: Analytics while the MVP is on, the operational Dashboard after. */
const HOME = ANALYTICS_MVP ? ANALYTICS_ROUTE : LEGACY_DASHBOARD_ROUTE;

/**
 * Optimistic auth check (cookie signature only, no database). Every page and action
 * re-verifies the user against the database via the DAL, so this is not the only guard.
 */
export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === '/login' || pathname === '/signup') {
    return session ? NextResponse.redirect(new URL(HOME, req.nextUrl)) : NextResponse.next();
  }
  if (!session) {
    // TEMPORARY (Analytics MVP): the analytics area is reachable without signing in while the
    // auth bypass is on. It is deliberately scoped to the analytics routes only, so the pages the
    // MVP hides (Cases, Report, Users, Profile) keep demanding a real session. The redirect below
    // is the real, untouched behaviour - it comes straight back with ANALYTICS_MVP_BYPASS_AUTH=false.
    if (authBypassEnabled() && MVP_BYPASS_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      return NextResponse.next();
    }
    const url = new URL('/login', req.nextUrl);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except API routes (they return 401 themselves), Next internals and static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
};