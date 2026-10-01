'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { fieldErrors, newCaseSchema, type FieldErrors } from '@/lib/validation';
import { CaseInputError, createCase } from '@/server/cases';
import { sendNewCaseEmail } from '@/server/notify';
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
    [...formData.entries()].filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, String(v)]),
  );
  const parsed = newCaseSchema.safeParse(values);
  if (!parsed.success) {
    return { error: 'Please fix the highlighted fields.', fieldErrors: fieldErrors(parsed.error), values };
  }

  let createdId: string;
  try {
    const created = await createCase(user, parsed.data);
    createdId = created.id;
  } catch (e) {
    if (e instanceof CaseInputError) return { error: e.message, fieldErrors: { [e.field]: [e.message] }, values };
    console.error('createCaseAction failed', e);
    return { error: 'The case could not be saved (database error). Nothing was lost; please try again.', values };
  }
  // Alert the Supply team once the response has gone out, so the salesperson never waits on the email.
  after(() => sendNewCaseEmail(createdId));
  redirect(`/cases/${createdId}?created=1`);
}
