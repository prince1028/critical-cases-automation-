import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session-token';

/**
 * Optimistic auth check (cookie signature only, no database). Every page and action
 * re-verifies the user against the database via the DAL, so this is not the only guard.
 */
export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === '/login' || pathname === '/signup') {
    return session ? NextResponse.redirect(new URL('/dashboard', req.nextUrl)) : NextResponse.next();
  }
  if (!session) {
    const url = new URL('/login', req.nextUrl);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except API routes (they return 401 themselves), Next internals and static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
};
