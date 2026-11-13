'use client';

import {
  BarChart3,
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Plus,
  UserRound,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/(app)/actions';
import { NotificationBell } from '@/components/notification-bell';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ANALYTICS_HREF } from '@/lib/analytics';
import { ROLE_LABELS } from '@/lib/constants';
import { WHATSAPP_IMPORT_ROUTE, type MvpNavItem } from '@/lib/mvp';
import { cn } from '@/lib/utils';

/**
 * Navigation.
 *
 * `mvp` and `nav` are handed in by the layout (a server component) rather than read here: this file
 * is a client component, and a client bundle has `process.env` substituted at build time, so the MVP
 * flag could never be switched back without rebuilding. While the MVP is on only the two MVP
 * destinations are visible; the full navigation still exists in src/lib/mvp.ts and every route behind
 * it still works, so flipping the flag off brings the product straight back.
 */
interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: typeof BarChart3;
}

const NAV_ICONS: Record<string, typeof BarChart3> = {
  '/dashboard': LayoutDashboard,
  '/cases': ClipboardList,
  '/cases/new': Plus,
  '/admin/analytics': BarChart3,
  '/analytics': BarChart3,
  '/admin/users': Users,
  [WHATSAPP_IMPORT_ROUTE]: MessageSquareText,
};

const PROFILE_TAB: NavItem = { href: '/profile', label: 'Profile', short: 'Profile', icon: UserRound };

const withIcons = (items: { href: string; label: string; short: string }[]): NavItem[] =>
  items.map((i) => ({ ...i, icon: NAV_ICONS[i.href] ?? BarChart3 }));

function isActive(pathname: string, href: string) {
  // A section is active for its whole subtree, so the analytics page covers its drilldowns.
  if (href === ANALYTICS_HREF) return pathname === ANALYTICS_HREF || pathname === '/admin/analytics';
  if (href.startsWith('/admin/')) return pathname.startsWith(href);
  if (href === '/cases') return pathname === '/cases' || (pathname.startsWith('/cases/') && pathname !== '/cases/new');
  return pathname === href;
}

interface HeaderUser {
  name: string;
  role: keyof typeof ROLE_LABELS;
  team: string | null;
}

const initialsOf = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export function AppHeader({
  user,
  unread,
  mvp,
  nav: navItems,
}: {
  user: HeaderUser;
  unread: number;
  mvp: boolean;
  nav: MvpNavItem[];
}) {
  const pathname = usePathname();
  const nav = withIcons(navItems);
  const home = mvp ? ANALYTICS_HREF : '/dashboard';

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href={home} className="flex items-center gap-2.5 font-semibold tracking-tight">
            <img src="/florzy-logo.png" alt="" width={32} height={32} className="size-8 rounded-lg shadow-sm" />
            <span className="leading-tight">
              Florzy
              <span className="block text-[11px] font-medium text-muted-foreground sm:inline sm:ml-1.5 sm:text-sm">Critical Cases</span>
            </span>
          </Link>
          <nav className="hidden h-full items-stretch gap-0.5 md:flex lg:gap-1" aria-label="Main">
            {nav.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center px-2 text-sm font-medium whitespace-nowrap lg:px-3 text-muted-foreground transition-colors hover:text-foreground',
                    active && 'text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {!mvp && (
              <>
                <Button asChild size="sm" className="hidden md:inline-flex">
                  <Link href="/cases/new">
                    <Plus /> Report Case
                  </Link>
                </Button>
                <NotificationBell initialUnread={unread} />
              </>
            )}
            <UserMenu user={user} />
          </div>
        </div>
      </header>
      <MobileTabBar nav={nav} pathname={pathname} />
    </>
  );
}

function UserMenu({ user }: { user: HeaderUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 gap-2 rounded-full px-1.5 sm:pr-3" aria-label="User menu">
          <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
            {initialsOf(user.name)}
          </span>
          <span className="hidden max-w-40 truncate text-sm lg:inline">{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="truncate">{user.name}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {ROLE_LABELS[user.role]}
            {user.team ? ` · ${user.team}` : ''}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserRound /> Profile & email
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/password">
            <KeyRound /> Change password
          </Link>
        </DropdownMenuItem>
        <form action={logoutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut /> Logout
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Phone navigation. The full product gets thumb-reachable tabs with a raised Report button in the
 * middle; the MVP has only two destinations, so they simply sit side by side with Profile.
 */
function MobileTabBar({ nav, pathname }: { nav: NavItem[]; pathname: string }) {
  const report = nav.find((n) => n.href === '/cases/new');
  const tabs = nav.filter((n) => n.href !== '/cases/new');

  const Tab = ({ item }: { item: NavItem }) => {
    const active = isActive(pathname, item.href);
    return (
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        aria-label={item.label}
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground',
          active && 'text-primary',
        )}
      >
        <item.icon className="size-5" strokeWidth={active ? 2.4 : 2} />
        {item.short}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Main mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <div className="mx-auto flex h-16 max-w-md items-stretch px-2">
        {!report && (
          <>
            {tabs.map((item) => (
              <Tab key={item.href} item={item} />
            ))}
            <Tab item={PROFILE_TAB} />
          </>
        )}
        {report && tabs.slice(0, 2).map((item) => <Tab key={item.href} item={item} />)}
        {report && (
          <div className="flex flex-1 items-start justify-center">
            <Link
              href={report.href}
              aria-label={report.label}
              aria-current={isActive(pathname, report.href) ? 'page' : undefined}
              className="-mt-5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background transition-transform active:scale-95"
            >
              <Plus className="size-7" strokeWidth={2.5} />
            </Link>
          </div>
        )}
        {report &&
          // Admins get Analytics and Users here; Profile stays in the account menu at the top.
          (tabs.length > 2 ? tabs.slice(2) : [...tabs.slice(2), PROFILE_TAB]).map((item) => <Tab key={item.href} item={item} />)}
      </div>
    </nav>
  );
}