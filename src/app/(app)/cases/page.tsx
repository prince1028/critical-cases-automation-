import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CasesTable } from '@/components/cases-table';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { canManageCases, canSeeAllCases, requireUser } from '@/lib/dal';
import { listCasesQuerySchema } from '@/lib/validation';
import { listCases } from '@/server/cases';
import { CasesFilters } from './cases-filters';
import { Pagination } from './pagination';

export const metadata: Metadata = { title: 'Critical Cases' };

export default async function CasesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const query = listCasesQuerySchema.parse({
    q: typeof sp.q === 'string' ? sp.q : undefined,
    status: typeof sp.status === 'string' ? sp.status : undefined,
    scope: typeof sp.scope === 'string' ? sp.scope : undefined,
    page: typeof sp.page === 'string' ? sp.page : undefined,
  });
  const allowAll = canSeeAllCases(user);
  const result = await listCases({
    user,
    // Case handlers (Supply team / admins) start on all cases; everyone else on their own.
    scope: query.scope ?? (canManageCases(user) ? 'all' : 'mine'),
    q: query.q || undefined,
    status: query.status,
    page: query.page ?? 1,
  });
  const filtered = Boolean(query.q || query.status);

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{result.scope === 'all' ? 'All Critical Cases' : 'My Cases'}</h1>
          <p className="text-sm text-muted-foreground">
            {result.total.toLocaleString('en-IN')} case{result.total === 1 ? '' : 's'}
            {filtered ? ' match your filters' : ''}
          </p>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/cases/new">
            <Plus /> Report Case
          </Link>
        </Button>
      </div>

      <CasesFilters allowAll={allowAll} scope={result.scope} q={query.q ?? ''} status={query.status ?? ''} />

      {result.rows.length ? (
        <>
          <CasesTable cases={result.rows} showReporter={result.scope === 'all'} />
          <Pagination page={result.page} pageSize={result.pageSize} total={result.total} />
        </>
      ) : filtered ? (
        <EmptyState title="No cases match your filters." description="Try a different search or status." showCta={false} />
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
