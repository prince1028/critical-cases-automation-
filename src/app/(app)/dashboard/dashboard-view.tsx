import { ArrowRight, CheckCircle2, CircleDot, Clock, ListPlus, Plus, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { CasesTable } from '@/components/cases-table';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { canManageCases, requireUser } from '@/lib/dal';
import { canMarkListed } from '@/lib/permissions';
import { getListingQueueCount, getMyCaseCounts, getSupplyQueueCounts, listRecentCases } from '@/server/cases';

/**
 * TEMPORARY (Analytics MVP): the operational dashboard is hidden from the navigation; its route
 * redirects to /analytics. This view is kept unchanged and stays reachable for the restore.
 */
export default async function DashboardView() {
  const user = await requireUser();
  const handler = canManageCases(user);
  const [counts, recent, queue, toList] = await Promise.all([
    getMyCaseCounts(user.id),
    listRecentCases(user.id, 5),
    handler ? getSupplyQueueCounts() : null,
    canMarkListed(user) ? getListingQueueCount() : null,
  ]);

  const stats = [
    { label: 'My Open Cases', short: 'Open', value: counts.open, icon: CircleDot, href: '/cases?status=NEW', tone: 'text-blue-600 bg-blue-50 dark:bg-blue-950/60' },
    { label: 'My In Progress', short: 'In progress', value: counts.inProgress, icon: Clock, href: '/cases?status=IN_PROGRESS', tone: 'text-amber-600 bg-amber-50 dark:bg-amber-950/60' },
    { label: 'My Resolved', short: 'Resolved', value: counts.resolved, icon: CheckCircle2, href: '/cases?status=RESOLVED', tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60' },
  ];

  return (
    <div className="grid gap-5 sm:gap-6">
      <div>
        <p className="text-sm text-muted-foreground">{user.team ?? 'Florzy'}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Welcome, {user.name}</h1>
      </div>

      {/* The one thing most people come here to do. */}
      <Link
        href="/cases/new"
        aria-label="Report Critical Case"
        className="group relative flex items-center gap-4 overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground shadow-md shadow-primary/25 transition-transform active:scale-[0.99] sm:p-6"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/20">
          <Plus className="size-6" strokeWidth={2.5} />
        </span>
        <span className="min-w-0">
          <span className="block text-lg font-semibold">Report Critical Case</span>
          <span className="block text-sm text-primary-foreground/85">Stock, colour, size, damage… report it as soon as it happens.</span>
        </span>
        <ArrowRight className="ml-auto size-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
        <span aria-hidden className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-white/10" />
      </Link>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            aria-label={`${s.label}: ${s.value}`}
            className="rounded-xl border bg-card p-3 shadow-xs transition-colors hover:border-primary/40 sm:p-5"
          >
            <span className={`mb-2 flex size-8 items-center justify-center rounded-lg sm:mb-3 sm:size-9 ${s.tone}`}>
              <s.icon className="size-4 sm:size-5" aria-hidden />
            </span>
            <p className="text-2xl font-semibold tabular-nums sm:text-3xl">{s.value}</p>
            <p className="text-xs text-muted-foreground sm:text-sm">
              <span className="sm:hidden">{s.short}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </p>
          </Link>
        ))}
      </div>

      {toList !== null && (
        <Card className="border-violet-300 dark:border-violet-800">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListPlus className="size-4" /> Waiting for Listing team
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/cases?scope=all&listing=pending" className="block rounded-lg border p-4 transition-colors hover:border-primary/40">
              <p className="text-sm text-muted-foreground">Tiles to list</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{toList}</p>
            </Link>
          </CardContent>
        </Card>
      )}

      {queue && (
        <Card className="border-primary/30">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" /> Waiting for Supply team
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Link href="/cases?scope=all&status=NEW" className="rounded-lg border p-4 transition-colors hover:border-primary/40">
              <p className="text-sm text-muted-foreground">New cases to pick up</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{queue.waiting}</p>
            </Link>
            <Link href="/cases?scope=all&status=IN_PROGRESS" className="rounded-lg border p-4 transition-colors hover:border-primary/40">
              <p className="text-sm text-muted-foreground">In progress</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{queue.inProgress}</p>
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">My Recent Cases</CardTitle>
          {recent.length > 0 && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/cases">
                View all <ArrowRight />
              </Link>
            </Button>
          )}
        </CardHeader>
        <CardContent>{recent.length ? <CasesTable cases={recent} /> : <EmptyState />}</CardContent>
      </Card>
    </div>
  );
}
