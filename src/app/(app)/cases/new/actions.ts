'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { fieldErrors, newCaseSchema, type FieldErrors } from '@/lib/validation';
import type { SkuItem } from '@/lib/sku-sheet';
import { CaseInputError, createCase } from '@/server/cases';
import { getSku } from '@/server/sku-sheet';
import { notifyNewCase } from '@/server/notifications';
import { sendNewCaseEmail } from '@/server/notify';
import { discardPhotos, uploadFormPhotos } from '@/server/photo-upload';
import { after } from 'next/server';

export interface CreateCaseState {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Echo of submitted values so the form keeps them after a failed submit. */
  values?: Record<string, string>;
}

export async function createCaseAction(_prev: CreateCaseState | undefined, formData: FormData): Promise<CreateCaseState> {
  // Identity comes from the session cookie, never from the form.
  const user = await requireUser();

  const values = Object.fromEntries(
    [...formData.entries()].filter(([k, v]) => !k.startsWith('$') && typeof v === 'string').map(([k, v]) => [k, String(v)]),
  );
  // Several problems can be picked; they arrive as repeated "issueTypes" fields (echoed back joined by commas).
  values.issueTypes = formData.getAll('issueTypes').map(String).join(',');
  const parsed = newCaseSchema.safeParse(values);
  if (!parsed.success) {
    return { error: 'Please fix the highlighted fields.', fieldErrors: fieldErrors(parsed.error), values };
  }

  // The item must exist in the item sheet; its details come from the sheet, not from the browser.
  let sku: SkuItem | null = null;
  if (parsed.data.skuCode) {
    try {
      sku = await getSku(parsed.data.skuCode);
    } catch (e) {
      console.error('createCaseAction: item sheet unavailable', e);
      return { error: 'The item list can’t be reached right now. Try again in a minute, or use “Tile not found”.', values };
    }
    if (!sku) {
      const msg = 'That item is no longer in the item sheet. Search again.';
      return { error: msg, fieldErrors: { skuCode: [msg] }, values };
    }
  }

  // Photos go to storage first; the case row only ever points at photos that exist.
  const upload = await uploadFormPhotos(formData);
  if (!upload.ok) return { error: upload.error, fieldErrors: { photos: [upload.error] }, values };
  const stored = upload.stored;

  let createdId: string;
  try {
    const created = await createCase(user, parsed.data, sku, stored);
    createdId = created.id;
  } catch (e) {
    await discardPhotos(stored);
    if (e instanceof CaseInputError) return { error: e.message, fieldErrors: { [e.field]: [e.message] }, values };
    console.error('createCaseAction failed', e);
    return { error: 'The case could not be saved (database error). Nothing was lost; please try again.', values };
  }
  // Alert the Supply team once the response has gone out, so the salesperson never waits on the email.
  after(() => sendNewCaseEmail(createdId));
  after(() => notifyNewCase(createdId, user));
  redirect(`/cases/${createdId}?created=1`);
}
