import 'server-only';
import { and, asc, count, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { criticalCases, users } from '@/db/schema';
import { generateTempPassword, hashPassword } from '@/lib/password';

export type Role = 'SALES' | 'MANAGER' | 'ADMIN';

export class UserAdminError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

/** Team names already in use, offered as suggestions in the admin forms. */
export async function listTeams(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ team: users.team })
    .from(users)
    .where(and(isNotNull(users.team), eq(users.active, true)))
    .orderBy(asc(users.team));
  return rows.map((r) => r.team!).filter(Boolean);
}

export async function listUsersForAdmin() {
  return db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      team: users.team,
      email: users.email,
      role: users.role,
      active: users.active,
      hasPassword: sql<boolean>`${users.passwordHash} IS NOT NULL`,
      mustChangePassword: users.mustChangePassword,
      lockedUntil: users.lockedUntil,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      casesReported: sql<number>`(SELECT count(*)::int FROM ${criticalCases} WHERE ${criticalCases.reportedBy} = ${users.id})`,
    })
    .from(users)
    .orderBy(asc(users.active), asc(users.name));
}

async function assertUsernameFree(username: string, exceptId?: string) {
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(exceptId ? and(eq(users.username, username), ne(users.id, exceptId)) : eq(users.username, username))
    .limit(1);
  if (taken) throw new UserAdminError('That username is already taken', 'username');
}

/** Emails are unique (one person per address, so nobody gets the same alert twice). */
async function assertEmailFree(email: string | null, exceptId?: string) {
  if (!email) return;
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(exceptId ? and(eq(users.email, email), ne(users.id, exceptId)) : eq(users.email, email))
    .limit(1);
  if (taken) throw new UserAdminError('Another user already has this email', 'email');
}

/** The signed-in person's own profile email (null clears it). */
export async function updateOwnEmail(userId: string, email: string | null) {
  await assertEmailFree(email, userId);
  await db.update(users).set({ email, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function getOwnProfile(userId: string) {
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return u ?? null;
}

async function activeAdminCount() {
  const [{ n }] = await db.select({ n: count() }).from(users).where(and(eq(users.role, 'ADMIN'), eq(users.active, true)));
  return Number(n);
}

/** Creates an employee login with a temporary password (returned once, never stored in plain text). */
export async function createUserWithLogin(input: { name: string; username: string; team: string; email: string | null; role: Role }) {
  await assertUsernameFree(input.username);
  await assertEmailFree(input.email);
  const tempPassword = generateTempPassword();
  const [u] = await db
    .insert(users)
    .values({ ...input, passwordHash: await hashPassword(tempPassword), mustChangePassword: true })
    .returning({ id: users.id });
  return { userId: u.id, tempPassword };
}

export async function updateUserByAdmin(
  actorId: string,
  input: { userId: string; name: string; username: string; team: string; email: string | null; role: Role; active: boolean },
) {
  const [current] = await db
    .select({ role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!current) throw new UserAdminError('User not found');

  if (input.userId === actorId && (input.role !== 'ADMIN' || !input.active)) {
    throw new UserAdminError('You can’t remove your own admin role or deactivate yourself.');
  }
  const losingAdmin = current.role === 'ADMIN' && current.active && (input.role !== 'ADMIN' || !input.active);
  if (losingAdmin && (await activeAdminCount()) <= 1) {
    throw new UserAdminError('There must always be at least one active admin.');
  }
  await assertUsernameFree(input.username, input.userId);
  await assertEmailFree(input.email, input.userId);

  await db
    .update(users)
    .set({
      name: input.name,
      username: input.username,
      team: input.team,
      email: input.email,
      role: input.role,
      active: input.active,
      // Deactivating signs the person out everywhere.
      ...(current.active && !input.active ? { sessionVersion: sql`${users.sessionVersion} + 1` } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, input.userId));
}

/** New temporary password for a user (e.g. forgotten password). Signs them out and unlocks the account. */
export async function resetPasswordByAdmin(userId: string) {
  const [u] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new UserAdminError('User not found');
  if (!u.username) throw new UserAdminError('Give this person a username first (Edit), then reset the password.');
  const tempPassword = generateTempPassword();
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      sessionVersion: sql`${users.sessionVersion} + 1`,
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  return { tempPassword };
}

/**
 * Self-registration from /signup: always SALES, active immediately. Refuses a name that already
 * belongs to an employee record (an admin gives that person a login instead), so nobody can
 * take over an existing employee and their cases by signing up with the same name.
 */
export async function registerSelf(input: { name: string; username: string; team: string; password: string }) {
  await assertUsernameFree(input.username);
  const [sameName] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(regexp_replace(trim(${users.name}), '\\s+', ' ', 'g')) = lower(${input.name})`)
    .limit(1);
  if (sameName) {
    throw new UserAdminError('An account for this name already exists. Log in, or ask an admin to set up your login.', 'name');
  }
  const [u] = await db
    .insert(users)
    .values({ name: input.name, username: input.username, team: input.team, role: 'SALES', passwordHash: await hashPassword(input.password) })
    .returning({ id: users.id, sessionVersion: users.sessionVersion });
  return u;
}
