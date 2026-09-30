import 'server-only';
import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { db } from '@/db';
import { users } from '@/db/schema';
import { readSession } from './session';

/** What the UI may know about the signed-in employee. */
export interface CurrentUser {
  id: string;
  name: string;
  username: string | null;
  team: string | null;
  role: 'SALES' | 'MANAGER' | 'ADMIN';
  mustChangePassword: boolean;
}

/**
 * The signed-in employee, verified against the database on every request: the account must exist,
 * be active, have a login, and the cookie's session version must match (password changes and
 * deactivation revoke old sessions). null when not signed in.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      team: users.team,
      role: users.role,
      mustChangePassword: users.mustChangePassword,
      sessionVersion: users.sessionVersion,
      hasPassword: users.passwordHash,
    })
    .from(users)
    .where(and(eq(users.id, session.userId), eq(users.active, true)))
    .limit(1);
  if (!user || !user.hasPassword || user.sessionVersion !== session.v) return null;
  const { sessionVersion: _v, hasPassword: _h, ...safe } = user;
  return safe;
});

/**
 * For pages and actions that need a signed-in employee: redirects to /login otherwise.
 * Users with a temporary password are sent to /account/password first.
 */
export async function requireUser(opts: { allowPasswordChangePending?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    // A valid cookie for a revoked/deactivated session must be cleared, or proxy.ts would bounce /login back here.
    redirect((await readSession()) ? '/api/session/clear' : '/login');
  }
  if (user.mustChangePassword && !opts.allowPasswordChangePending) redirect('/account/password');
  return user;
}

/** Admin-only pages and actions. Non-admins get a 404 so the page's existence isn't advertised. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== 'ADMIN') notFound();
  return user;
}

export { canManageCases, canSeeAllCases } from './permissions';
