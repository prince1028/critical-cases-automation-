'use server';

import { redirect } from 'next/navigation';
import { ANALYTICS_MVP, ANALYTICS_ROUTE } from '@/lib/mvp';
import { createSession } from '@/lib/session';
import { fieldErrors, loginSchema, type FieldErrors } from '@/lib/validation';
import { authenticate, LOCK_MINUTES } from '@/server/auth';

export interface LoginState {
  error?: string;
  fieldErrors?: FieldErrors;
  username?: string;
}

export async function loginAction(_prev: LoginState | undefined, formData: FormData): Promise<LoginState> {
  const raw = { username: String(formData.get('username') ?? ''), password: String(formData.get('password') ?? '') };
  const parsed = loginSchema.safeParse(raw);
  // Never echo the password back.
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), username: raw.username };

  let mustChange = false;
  try {
    const result = await authenticate(parsed.data.username, parsed.data.password);
    if (!result.ok) {
      return {
        error:
          result.reason === 'locked'
            ? `Too many wrong attempts. This account is locked for ${LOCK_MINUTES} minutes, or ask an admin to reset your password.`
            : 'Invalid username or password.',
        username: raw.username,
      };
    }
    await createSession(result.userId, result.sessionVersion);
    mustChange = result.mustChangePassword;
  } catch (e) {
    console.error('loginAction failed', e);
    return { error: 'Could not reach the database. Please try again in a moment.', username: raw.username };
  }
  // TEMPORARY (Analytics MVP): signing in lands on Analytics while the MVP is on. With
  // ANALYTICS_MVP=false this goes back to the operational Dashboard.
  redirect(mustChange ? '/account/password' : ANALYTICS_MVP ? ANALYTICS_ROUTE : '/dashboard');
}
