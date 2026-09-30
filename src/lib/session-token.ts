import { SignJWT, jwtVerify } from 'jose';

/**
 * Signed session token (HS256 JWT). Holds only the user id and session version; role and name are always
 * re-read from the database, so a stale token can't keep someone's old role.
 * Kept free of Next.js imports so both proxy.ts and tests can use it.
 */
export const SESSION_COOKIE = 'florzy_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  userId: string;
  /** users.session_version at login; a mismatch means the session was revoked. */
  v: number;
}

function key(secret = process.env.SESSION_SECRET): Uint8Array {
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters (see .env.example)');
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload, secret?: string): Promise<string> {
  return new SignJWT({ userId: payload.userId, v: payload.v })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(key(secret));
}

export async function verifySessionToken(token: string | undefined, secret?: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
    return typeof payload.userId === 'string' && typeof payload.v === 'number' ? { userId: payload.userId, v: payload.v } : null;
  } catch {
    return null;
  }
}
