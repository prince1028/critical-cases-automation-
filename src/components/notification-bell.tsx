'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const POLL_MS = 30_000;

/** Bell with the unread count; checks for new notifications every 30 s while the tab is visible. */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const pathname = usePathname();

  useEffect(() => setUnread(initialUnread), [initialUnread]);

  useEffect(() => {
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/notifications', { cache: 'no-store' });
        if (res.ok) setUnread((await res.json()).unread);
      } catch {
        // offline: keep the last count
      }
    };
    check(); // also after navigating: opening a case marks its notifications read
    const t = setInterval(check, POLL_MS);
    return () => clearInterval(t);
  }, [pathname]);

  const label = unread ? `Notifications, ${unread} unread` : 'Notifications';
  return (
    <Link
      href="/notifications"
      aria-label={label}
      title={label}
      className={cn(
        'relative flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        pathname === '/notifications' && 'bg-accent text-foreground',
      )}
    >
      <Bell className="size-5" />
      {unread > 0 && (
        <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-bold text-primary-foreground ring-2 ring-background">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
