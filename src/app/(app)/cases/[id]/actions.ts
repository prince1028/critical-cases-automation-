'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/dal';
import { STATUS_LABELS } from '@/lib/constants';
import { STATUS_ACTIONS } from '@/lib/permissions';
import { addCaseMessage, addCasePhotos, CaseActionError, markCaseListed, photoSlotsForUser, updateCaseStatus } from '@/server/cases';
import { notifyListed, notifyMessage, notifyStatus } from '@/server/notifications';
import { discardPhotos, uploadFormPhotos } from '@/server/photo-upload';

/** How a status change reads in a notification. */
const STATUS_NEWS = { START: 'Work started', RESOLVE: 'Case resolved', CLOSE: 'Case closed', REOPEN: 'Case reopened' } as const;

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
    const { caseId, action, note } = parsed.data;
    after(() => notifyStatus(caseId, user, STATUS_NEWS[action], note));
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

export interface AddPhotosState {
  ok?: boolean;
  message?: string;
  error?: string;
}

export async function addPhotosAction(_prev: AddPhotosState | undefined, formData: FormData): Promise<AddPhotosState> {
  const user = await requireUser();
  const caseId = z.uuid().safeParse(formData.get('caseId'));
  if (!caseId.success) return { error: 'Invalid request' };

  const onCase = await photoSlotsForUser(caseId.data, user).catch((e) => {
    console.error('addPhotosAction lookup failed', e);
    return undefined;
  });
  if (onCase === undefined) return { error: 'The photos could not be saved (database error). Please try again.' };
  if (onCase === null) return { error: 'You can’t add photos to this case.' };
  if (!formData.getAll('photos').some((f) => f instanceof File && f.size > 0)) return { error: 'Choose at least one photo.' };

  const upload = await uploadFormPhotos(formData, onCase);
  if (!upload.ok) return { error: upload.error };
  try {
    await addCasePhotos(user, caseId.data, upload.stored);
  } catch (e) {
    await discardPhotos(upload.stored);
    if (e instanceof CaseActionError) return { error: e.message };
    console.error('addPhotosAction failed', e);
    return { error: 'The photos could not be saved (database error). Please try again.' };
  }
  revalidatePath(`/cases/${caseId.data}`);
  const n = upload.stored.length;
  return { ok: true, message: `${n} photo${n === 1 ? '' : 's'} added` };
}

export interface MessageState {
  ok?: boolean;
  error?: string;
  /** Bumped on every successful post so the form can clear itself. */
  sent?: number;
}

export async function postMessageAction(prev: MessageState | undefined, formData: FormData): Promise<MessageState> {
  const user = await requireUser();
  const caseId = z.uuid().safeParse(formData.get('caseId'));
  if (!caseId.success) return { error: 'Invalid request' };
  try {
    const text = String(formData.get('message') ?? '');
    await addCaseMessage(user, caseId.data, text);
    const id = caseId.data;
    after(() => notifyMessage(id, user, text.trim()));
  } catch (e) {
    if (e instanceof CaseActionError) return { error: e.message };
    console.error('postMessageAction failed', e);
    return { error: 'The message could not be sent (database error). Please try again.' };
  }
  revalidatePath(`/cases/${caseId.data}`);
  return { ok: true, sent: (prev?.sent ?? 0) + 1 };
}

export async function markListedAction(_prev: StatusActionState | undefined, formData: FormData): Promise<StatusActionState> {
  const user = await requireUser();
  const parsed = z
    .object({ caseId: z.uuid(), note: schema.shape.note })
    .safeParse({ caseId: formData.get('caseId'), note: String(formData.get('note') ?? '') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid request' };
  try {
    await markCaseListed(user, parsed.data.caseId, parsed.data.note);
    const { caseId, note } = parsed.data;
    after(() => notifyListed(caseId, user, note));
  } catch (e) {
    if (e instanceof CaseActionError) return { error: e.message };
    console.error('markListedAction failed', e);
    return { error: 'Could not save (database error). Please try again.' };
  }
  revalidatePath(`/cases/${parsed.data.caseId}`);
  revalidatePath('/cases');
  revalidatePath('/dashboard');
  return { ok: true, message: 'Marked as listed 👍' };
}
