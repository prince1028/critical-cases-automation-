import { ArrowRight, CheckCircle2, CircleDot, Clock, Plus, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CasesTable } from '@/components/cases-table';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { canManageCases, requireUser } from '@/lib/dal';
import { getMyCaseCounts, getSupplyQueueCounts, listRecentCases } from '@/server/cases';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const user = await requireUser();
  const handler = canManageCases(user);
  const [counts, recent, queue] = await Promise.all([
    getMyCaseCounts(user.id),
    listRecentCases(user.id, 5),
    handler ? getSupplyQueueCounts() : null,
  ]);

  const stats = [
    { label: 'My Open Cases', value: counts.open, icon: CircleDot, href: '/cases?status=NEW', tone: 'text-blue-600' },
    { label: 'My In Progress', value: counts.inProgress, icon: Clock, href: '/cases?status=IN_PROGRESS', tone: 'text-amber-600' },
    { label: 'My Resolved', value: counts.resolved, icon: CheckCircle2, href: '/cases?status=RESOLVED', tone: 'text-emerald-600' },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name}</h1>
          <p className="text-sm text-muted-foreground">Report a supply problem as soon as it happens.</p>
        </div>
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/cases/new">
            <Plus /> Report Critical Case
          </Link>
        </Button>
      </div>

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

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="group">
            <Card className="py-4 transition-colors group-hover:border-primary/40">
              <CardContent className="flex items-center justify-between px-4">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">{s.value}</p>
                </div>
                <s.icon className={`size-6 ${s.tone}`} aria-hidden />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

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
