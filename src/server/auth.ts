import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { getDummyHash, hashPassword, verifyPassword } from '@/lib/password';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export type AuthResult =
  | { ok: true; userId: string; sessionVersion: number; mustChangePassword: boolean }
  | { ok: false; reason: 'invalid' | 'locked' };

/**
 * Username + password check. Same generic answer for unknown user, wrong password and no-login accounts
 * (no username enumeration); a dummy hash keeps timing similar. Locks the account for LOCK_MINUTES after
 * MAX_FAILED_ATTEMPTS wrong passwords.
 */
export async function authenticate(username: string, password: string): Promise<AuthResult> {
  const [u] = await db
    .select({
      id: users.id,
      hash: users.passwordHash,
      active: users.active,
      lockedUntil: users.lockedUntil,
      sessionVersion: users.sessionVersion,
      mustChangePassword: users.mustChangePassword,
    })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!u || !u.hash || !u.active) {
    await verifyPassword(password, await getDummyHash());
    return { ok: false, reason: 'invalid' };
  }
  if (u.lockedUntil && u.lockedUntil > new Date()) return { ok: false, reason: 'locked' };

  if (!(await verifyPassword(password, u.hash))) {
    await db
      .update(users)
      .set({
        failedLoginAttempts: sql`${users.failedLoginAttempts} + 1`,
        lockedUntil: sql`CASE WHEN ${users.failedLoginAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS}
                         THEN now() + make_interval(mins => ${LOCK_MINUTES}) ELSE NULL END`,
      })
      .where(eq(users.id, u.id));
    return { ok: false, reason: 'invalid' };
  }

  await db
    .update(users)
    .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, u.id));
  return { ok: true, userId: u.id, sessionVersion: u.sessionVersion, mustChangePassword: u.mustChangePassword };
}

/** Changes the user's own password after re-checking the current one. Returns the new session version. */
export async function changeOwnPassword(userId: string, currentPassword: string, newPassword: string) {
  const [u] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u || !(await verifyPassword(currentPassword, u.hash))) return { ok: false as const };
  const [updated] = await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      sessionVersion: sql`${users.sessionVersion} + 1`,
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({ sessionVersion: users.sessionVersion });
  return { ok: true as const, sessionVersion: updated.sessionVersion };
}
