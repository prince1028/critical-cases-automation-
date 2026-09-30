'use server';

import { redirect } from 'next/navigation';
import { createSession } from '@/lib/session';
import { fieldErrors, signupSchema, type FieldErrors } from '@/lib/validation';
import { registerSelf, UserAdminError } from '@/server/users';

export interface SignupState {
  error?: string;
  fieldErrors?: FieldErrors;
  values?: { name: string; username: string; team: string };
}

export async function signupAction(_prev: SignupState | undefined, formData: FormData): Promise<SignupState> {
  const raw = {
    name: String(formData.get('name') ?? ''),
    username: String(formData.get('username') ?? ''),
    team: String(formData.get('team') ?? ''),
    password: String(formData.get('password') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? ''),
  };
  const values = { name: raw.name, username: raw.username, team: raw.team }; // passwords are never echoed back
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  try {
    const u = await registerSelf(parsed.data);
    await createSession(u.id, u.sessionVersion);
  } catch (e) {
    if (e instanceof UserAdminError) return { error: e.message, fieldErrors: e.field ? { [e.field]: [e.message] } : undefined, values };
    console.error('signupAction failed', e);
    return { error: 'Could not create the account (database error). Please try again.', values };
  }
  redirect('/dashboard');
}
