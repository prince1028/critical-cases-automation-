'use client';

import { ClipboardList, KeyRound, LayoutDashboard, LogOut, Menu, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { logoutAction } from '@/app/(app)/actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ROLE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';

const BASE_NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/cases', label: 'Critical Cases', icon: ClipboardList },
  { href: '/cases/new', label: 'Report Case', icon: Plus },
];
const ADMIN_NAV = { href: '/admin/users', label: 'Users', icon: Users };

function isActive(pathname: string, href: string) {
  if (href === '/admin/users') return pathname.startsWith('/admin');
  if (href === '/cases') return pathname === '/cases' || (pathname.startsWith('/cases/') && pathname !== '/cases/new');
  return pathname === href;
}

interface HeaderUser {
  name: string;
  role: keyof typeof ROLE_LABELS;
  team: string | null;
}

export function AppHeader({ user }: { user: HeaderUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const NAV = user.role === 'ADMIN' ? [...BASE_NAV, ADMIN_NAV] : BASE_NAV;
  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <Menu />
        </Button>
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <img src="/florzy-logo.png" alt="" width={28} height={28} className="size-7 rounded-md" />
          <span className="hidden sm:inline">Florzy Critical Cases</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                isActive(pathname, item.href) && 'bg-accent text-foreground',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2" aria-label="User menu">
                <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                  {initials}
                </span>
                <span className="hidden max-w-40 truncate text-sm sm:inline">{user.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="grid gap-0.5">
                <span className="truncate">{user.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {ROLE_LABELS[user.role]}
                  {user.team ? ` · ${user.team}` : ''}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
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
        </div>
      </div>
      {open && (
        <nav className="border-t px-4 py-2 md:hidden" aria-label="Main mobile">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground',
                isActive(pathname, href) && 'bg-accent text-foreground',
              )}
            >
              <Icon className="size-4" /> {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
