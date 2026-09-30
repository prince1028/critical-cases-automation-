import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session-token';

/** Clears a session cookie whose user no longer exists or is deactivated, then goes to /login. */
export async function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', request.nextUrl));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
