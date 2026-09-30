'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/dal';
import { STATUS_LABELS } from '@/lib/constants';
import { STATUS_ACTIONS } from '@/lib/permissions';
import { CaseActionError, updateCaseStatus } from '@/server/cases';

const schema = z.object({
  caseId: z.uuid(),
  action: z.enum(['START', 'RESOLVE', 'CLOSE', 'REOPEN']),
  note: z
    .string()
    .trim()
    .max(2000, { error: 'Keep the note under 2000 characters' })
    .transform((v) => (v === '' ? null : v)),
});

export interface StatusActionState {
  ok?: boolean;
  message?: string;
  error?: string;
}

export async function updateStatusAction(_prev: StatusActionState | undefined, formData: FormData): Promise<StatusActionState> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    caseId: formData.get('caseId'),
    action: formData.get('action'),
    note: String(formData.get('note') ?? ''),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid request' };

  try {
    const { status } = await updateCaseStatus(user, parsed.data.caseId, parsed.data.action, parsed.data.note);
    revalidatePath(`/cases/${parsed.data.caseId}`);
    revalidatePath('/cases');
    revalidatePath('/dashboard');
    return { ok: true, message: `${STATUS_ACTIONS[parsed.data.action].label.replace(' case', '')}: case is now ${STATUS_LABELS[status]}` };
  } catch (e) {
    if (e instanceof CaseActionError) return { error: e.message };
    console.error('updateStatusAction failed', e);
    return { error: 'The status could not be saved (database error). Please try again.' };
  }
}
