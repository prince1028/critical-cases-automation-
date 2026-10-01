'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/dal';
import { fieldErrors, profileSchema, type FieldErrors } from '@/lib/validation';
import { updateOwnEmail, UserAdminError } from '@/server/users';

export interface ProfileState {
  ok?: boolean;
  error?: string;
  fieldErrors?: FieldErrors;
  /** Changes on every success so the client can react to repeated saves. */
  nonce?: number;
}

export async function updateProfileAction(_prev: ProfileState | undefined, formData: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({ email: formData.get('email') ?? '' });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  try {
    await updateOwnEmail(user.id, parsed.data.email);
  } catch (e) {
    if (e instanceof UserAdminError) return { fieldErrors: { email: [e.message] } };
    console.error('updateProfileAction failed', e);
    return { error: 'Could not save (database error). Please try again.' };
  }
  revalidatePath('/profile');
  return { ok: true, nonce: Date.now() };
}
