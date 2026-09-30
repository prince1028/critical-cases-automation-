'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/dal';
import { adminCreateUserSchema, adminUpdateUserSchema, fieldErrors, type FieldErrors } from '@/lib/validation';
import { createUserWithLogin, resetPasswordByAdmin, updateUserByAdmin, UserAdminError } from '@/server/users';

export interface AdminUserState {
  ok?: boolean;
  error?: string;
  fieldErrors?: FieldErrors;
  /** Shown to the admin exactly once, to hand to the employee. Never stored in plain text. */
  tempPassword?: string;
  username?: string;
  /** Changes on every success so the client can react to repeated successes. */
  nonce?: number;
}

const DB_ERROR = 'Could not save (database error). Please try again.';

function handle(e: unknown): AdminUserState {
  if (e instanceof UserAdminError) return { error: e.message, fieldErrors: e.field ? { [e.field]: [e.message] } : undefined };
  console.error('admin user action failed', e);
  return { error: DB_ERROR };
}

export async function createUserAction(_prev: AdminUserState | undefined, formData: FormData): Promise<AdminUserState> {
  await requireAdmin();
  const parsed = adminCreateUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  try {
    const { tempPassword } = await createUserWithLogin(parsed.data);
    revalidatePath('/admin/users');
    return { ok: true, tempPassword, username: parsed.data.username, nonce: Date.now() };
  } catch (e) {
    return handle(e);
  }
}

export async function updateUserAction(_prev: AdminUserState | undefined, formData: FormData): Promise<AdminUserState> {
  const admin = await requireAdmin();
  const parsed = adminUpdateUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  try {
    await updateUserByAdmin(admin.id, parsed.data);
    revalidatePath('/admin/users');
    return { ok: true, nonce: Date.now() };
  } catch (e) {
    return handle(e);
  }
}

export async function resetPasswordAction(_prev: AdminUserState | undefined, formData: FormData): Promise<AdminUserState> {
  await requireAdmin();
  const userId = z.uuid().safeParse(formData.get('userId'));
  if (!userId.success) return { error: 'Invalid user' };
  try {
    const { tempPassword } = await resetPasswordByAdmin(userId.data);
    revalidatePath('/admin/users');
    return { ok: true, tempPassword, username: String(formData.get('username') ?? ''), nonce: Date.now() };
  } catch (e) {
    return handle(e);
  }
}
