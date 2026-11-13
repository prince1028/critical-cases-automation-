'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/dal';
import { markNotificationsRead } from '@/server/notifications';

export async function markAllReadAction() {
  const user = await requireUser();
  await markNotificationsRead(user.id);
  revalidatePath('/notifications');
}
