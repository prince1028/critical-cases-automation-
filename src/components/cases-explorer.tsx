import Link from 'next/link';
import type { ReactNode } from 'react';
import { ExternalLink, Filter, Lock } from 'lucide-react';
import { ExplorerFilters } from '@/components/explorer-filters';
import { IssueLabel, SourceBadge, StatusBadge } from '@/components/case-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Bucket, ExplorerParams } from '@/lib/analytics';
import { explorerHref } from '@/lib/analytics';
import { reviewReasonLabel } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { exploreCases, explorerFacets, type ExplorerCase } from '@/server/analytics';

/**
 * The read-only Case Explorer: the cases behind the dashboard's numbers.
 *
 * It is part of the analytics page and shares its URL, so any signal can be opened into it and the
 * list can be refined further. Every row links to the case, which keeps the original WhatsApp
 * messages and the source the number came from. Nothing here can create, edit or resolve a case.
 */
export async function CaseExplorer({
  values,
  base,
  bucket,
}: {
  /** Explorer filters taken from the URL. */
  values: ExplorerParams;
  /** The dashboard's own filters (range/source), preserved by every explorer navigation. */
  base: ExplorerParams;
  /** Bucket size of the trend chart, needed to turn a clicked column into a date window. */
  bucket?: Bucket;
}) {
  const [result, facets] = await Promise.all([exploreCases(values), explorerFacets()]);

  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const go = (patch: ExplorerParams) => explorerHref({ ...base, ...values, ...patch });

  return (
    <section id="explorer" className="scroll-mt-20 grid gap-4" aria-labelledby="explorer-heading">
      <Card>
        <CardHeader>
          <CardTitle id="explorer-heading" className="flex items-center gap-2 text-base">
            <Filter className="size-4" aria-hidden /> Case Explorer
          </CardTitle>
          <CardDescription>
            The records behind the numbers above. Read-only: no case can be created, edited, assigned or resolved here.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <ExplorerFilters values={values} base={base} issues={facets.issues} reporters={facets.reporters} tiles={facets.tiles} />

          {result.chips.length > 0 && (
            <ul className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
              {result.chips.map((chip) => {
                const cleared: Record<string, string | undefined> = { ...base, ...values };
                for (const k of chip.keys) delete cleared[k];
                return (
                  <li key={chip.id}>
                    <Link
                      href={explorerHref(cleared)}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
                    >
                      {chip.label}
                      <span aria-hidden>×</span>
                      <span className="sr-only">Remove this filter</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {result.total.toLocaleString('en-IN')} case{result.total === 1 ? '' : 's'}
            </CardTitle>
            <CardDescription>Newest first. Open a case to see its original report.</CardDescription>
          </div>
          {bucket && values.bucket && (
            <span className="text-xs text-muted-foreground">
              Showing the period of the column that was clicked.
            </span>
          )}
        </CardHeader>
        <CardContent>
          {result.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No cases match these filters.</p>
          ) : (
            <>
              <ExplorerTable rows={result.rows} />
              {pages > 1 && (
                <nav className="mt-3 flex items-center justify-between gap-2" aria-label="Case Explorer pages">
                  <PageLink href={go({ page: String(Math.max(1, result.page - 1)) })} disabled={result.page <= 1}>
                    Previous
                  </PageLink>
                  <span className="text-xs text-muted-foreground">
                    Page {result.page} of {pages}
                  </span>
                  <PageLink href={go({ page: String(Math.min(pages, result.page + 1)) })} disabled={result.page >= pages}>
                    Next
                  </PageLink>
                </nav>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function ExplorerTable({ rows }: { rows: ExplorerCase[] }) {
  return (
    <>
      {/* Cards on small screens */}
      <ul className="grid gap-2 md:hidden">
        {rows.map((c) => (
          <li key={c.id}>
            <Link href={`/cases/${c.id}`} className="block rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold">{c.caseCode ?? c.reportedOn ?? '—'}</span>
                <StatusBadge status={c.status} />
              </div>
              <div className="mt-1 text-sm font-medium">
                <IssueLabel issue={c.issueType} more={c.secondaryIssueTypes?.length} />
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">{c.tileCode ?? c.tileLabel ?? 'No tile'}</span>
                <span className="shrink-0">{c.reportedOn ?? '—'}</span>
              </div>
              {c.needsReview && <ReviewTags reasons={c.reviewReasons} />}
            </Link>
          </li>
        ))}
      </ul>

      {/* Table on larger screens */}
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium">Case</th>
              <th scope="col" className="px-3 py-2 font-medium">Tile</th>
              <th scope="col" className="px-3 py-2 font-medium">Issue</th>
              <th scope="col" className="px-3 py-2 font-medium">Reported by</th>
              <th scope="col" className="px-3 py-2 font-medium">Date</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b last:border-0 align-top">
                <td className="px-3 py-2">
                  <Link href={`/cases/${c.id}`} className="inline-flex items-center gap-1 font-mono font-medium hover:underline">
                    {c.caseCode ?? '—'} <ExternalLink className="size-3 opacity-60" aria-hidden />
                  </Link>
                  {c.needsReview && <ReviewTags reasons={c.reviewReasons} />}
                </td>
                <td className="max-w-48 px-3 py-2">
                  {c.tileCode ? (
                    <span>
                      <span className="font-mono">{c.tileCode}</span>
                      {c.tileLabel && <span className="block truncate text-xs text-muted-foreground">{c.tileLabel}</span>}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{c.tileLabel ?? 'No tile'}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <IssueLabel issue={c.issueType} more={c.secondaryIssueTypes?.length} />
                    {c.confidence === 'LOW' && <span className="text-xs text-muted-foreground">low confidence</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{c.reporterName ?? 'Unknown'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDate(c.reportedOn)}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-3 py-2">
                  <SourceBadge source={c.source} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3" aria-hidden />
        Analytics only. Case handling (report, assign, resolve) stays in the case pages.
      </p>
    </>
  );
}

/**
 * A page link. An anchor cannot be disabled, so an out-of-range end is taken out of the tab order
 * and out of the pointer's reach rather than rendered as a live link.
 */
function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: ReactNode }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link
        href={href}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        className={cn(disabled && 'pointer-events-none opacity-50')}
      >
        {children}
      </Link>
    </Button>
  );
}

function ReviewTags({ reasons }: { reasons: string[] | null }) {
  if (!reasons?.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {reasons.slice(0, 3).map((r) => (
        <span key={r} className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {reviewReasonLabel(r)}
        </span>
      ))}
    </span>
  );
}