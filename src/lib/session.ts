import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, signSession, verifySessionToken } from './session-token';

export async function createSession(userId: string, sessionVersion: number) {
  const token = await signSession({ userId, v: sessionVersion });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function readSession() {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
