import { Bell, CheckCheck, ClipboardList, MessageSquareText, RefreshCw, ThumbsUp } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { NotificationKind } from '@/db/schema';
import { requireUser } from '@/lib/dal';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { listNotifications } from '@/server/notifications';
import { markAllReadAction } from './actions';

export const metadata: Metadata = { title: 'Notifications' };

const ICONS: Record<NotificationKind, React.ComponentType<{ className?: string }>> = {
  NEW_CASE: ClipboardList,
  MESSAGE: MessageSquareText,
  STATUS: RefreshCw,
  LISTED: ThumbsUp,
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listNotifications(user.id);
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">{unread ? `${unread} unread` : 'You’re all caught up.'}</p>
        </div>
        {unread > 0 && (
          <form action={markAllReadAction}>
            <Button type="submit" variant="outline" size="sm">
              <CheckCheck /> Mark all read
            </Button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Bell className="size-6" />
            </span>
            <p className="font-medium">No notifications yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              New cases, messages and status changes on your cases show up here, and by email.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 py-0 sm:py-0">
          <ul className="divide-y" aria-label="Notifications">
            {items.map((n) => {
              const Icon = ICONS[n.kind];
              const inner = (
                <>
                  <span
                    className={cn(
                      'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full',
                      n.readAt ? 'bg-muted text-muted-foreground' : 'bg-accent text-accent-foreground',
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn('text-sm', !n.readAt && 'font-semibold')}>{n.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(n.createdAt)}</span>
                    </span>
                    {n.caseCode && <span className="block font-mono text-xs text-muted-foreground">{n.caseCode}</span>}
                    {n.body && <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{n.body}</span>}
                  </span>
                  {!n.readAt && <span aria-label="Unread" className="mt-2 size-2 shrink-0 rounded-full bg-primary" />}
                </>
              );
              return (
                <li key={n.id}>
                  {n.caseId ? (
                    <Link href={`/cases/${n.caseId}`} className="flex gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 sm:px-5">
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex gap-3 px-4 py-3.5 sm:px-5">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
