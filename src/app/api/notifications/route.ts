import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { unreadCount } from '@/server/notifications';

/** Unread count for the bell (polled by the header). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  try {
    return NextResponse.json({ unread: await unreadCount(user.id) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('unread count failed', e);
    return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
  }
}
