'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { createSession } from '@/lib/session';
import { changePasswordSchema, fieldErrors, type FieldErrors } from '@/lib/validation';
import { changeOwnPassword } from '@/server/auth';

export interface ChangePasswordState {
  error?: string;
  fieldErrors?: FieldErrors;
}

export async function changePasswordAction(_prev: ChangePasswordState | undefined, formData: FormData): Promise<ChangePasswordState> {
  const user = await requireUser({ allowPasswordChangePending: true });
  const parsed = changePasswordSchema.safeParse({
    currentPassword: String(formData.get('currentPassword') ?? ''),
    newPassword: String(formData.get('newPassword') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  try {
    const result = await changeOwnPassword(user.id, parsed.data.currentPassword, parsed.data.newPassword);
    if (!result.ok) return { fieldErrors: { currentPassword: ['Current password is incorrect'] } };
    // Other sessions were revoked by the version bump; keep this one signed in.
    await createSession(user.id, result.sessionVersion);
  } catch (e) {
    console.error('changePasswordAction failed', e);
    return { error: 'Could not save the new password (database error). Please try again.' };
  }
  redirect('/dashboard?password=changed');
}
