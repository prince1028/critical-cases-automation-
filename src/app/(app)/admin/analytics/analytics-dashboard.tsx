import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, TriangleAlert } from 'lucide-react';
import { CaseExplorer } from '@/components/cases-explorer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CaseStatus, IssueType } from '@/db/schema';
import {
  bucketTitle,
  changeLabel,
  changeOf,
  explorerHref,
  EXPLORER_KEYS,
  formatHours,
  parseRange,
  parseSource,
  RANGES,
  SOURCES,
  type ExplorerParams,
  type RangeKey,
  type SourceKey,
} from '@/lib/analytics';
import { ISSUE_LABELS, reviewReasonLabel, STATUS_LABELS } from '@/lib/constants';
import { requireAnalyticsViewer } from '@/lib/dal';
import { formatDate } from '@/lib/format';
import { ANALYTICS_MVP, WHATSAPP_IMPORT_ROUTE } from '@/lib/mvp';
import { cn } from '@/lib/utils';
import { getAnalytics } from '@/server/analytics';
import { TrendChart } from './trend-chart';

export const metadata: Metadata = { title: 'Analytics' };

const STATUS_ORDER: CaseStatus[] = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'];
const STATUS_FILL: Record<CaseStatus, string> = {
  NEW: 'bg-chart-new',
  IN_PROGRESS: 'bg-chart-progress',
  RESOLVED: 'bg-chart-resolved',
  CANCELLED: 'bg-chart-cancelled',
};

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Explorer filter keys as a plain record, so the dashboard's own range/source ride along in every link. */
const fromParams = (params: Record<string, string | undefined>): ExplorerParams => {
  const out: ExplorerParams = {};
  for (const k of EXPLORER_KEYS) {
    const v = params[k];
    if (v) out[k] = v;
  }
  return out;
};

/**
 * The Critical Cases Analytics dashboard - the one product area of this version.
 *
 * It renders the analysis the app already had (getAnalytics + the shared chart helpers) and adds the
 * drilldown: every headline number, bar, trend column and review reason links into the Case Explorer,
 * which lists the cases behind it and links on to the original report. Read-only by design.
 *
 * Rendered by /analytics (the MVP landing page) and by /admin/analytics (kept for the restore).
 * Both routes share this component; there is only ever one implementation.
 */
export async function AnalyticsDashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAnalyticsViewer();
  const params = await searchParams;
  const range = parseRange(params.range);
  const source = parseSource(params.source);
  const a = await getAnalytics(range, source);
  const bucket = RANGES[range].bucket;

  const open = a.byStatus.NEW + a.byStatus.IN_PROGRESS;
  const base = { range, source, ...fromParams(params) };
  // The dashboard's own filters, kept on every explorer navigation.
  const dashboard: ExplorerParams = { range, source };
  const href = (r: RangeKey, s: SourceKey) => `/analytics?range=${r}&source=${s}`;
  const drill = (filter: ExplorerParams) => explorerHref({ ...dashboard, ...base }, filter);

  return (
    <div className="grid gap-5 sm:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Critical Cases Analytics</h1>
          <p className="text-sm text-muted-foreground">
            {a.from ? `${formatDate(a.from)} – ${formatDate(a.to)}` : `All cases up to ${formatDate(a.to)}`} · every number
            links to the cases behind it
          </p>
        </div>
        {ANALYTICS_MVP && (
          <Link
            href={WHATSAPP_IMPORT_ROUTE}
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Import WhatsApp data <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>

      {/* One filter row; it scopes every number below. */}
      <div className="flex flex-wrap gap-2">
        <Segmented label="Date range" items={Object.entries(RANGES).map(([k, v]) => ({ key: k, label: v.label, href: href(k as RangeKey, source) }))} value={range} />
        <Segmented label="Cases" items={Object.entries(SOURCES).map(([k, v]) => ({ key: k, label: v, href: href(range, k as SourceKey) }))} value={source} />
      </div>

      {/* ---------- A. Overview ---------- */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <Stat
          label="Total Critical Cases"
          value={a.total.toLocaleString('en-IN')}
          hint={`in ${RANGES[range].label.toLowerCase()}`}
          change={changeOf(a.total, a.previous.total)}
          href={drill({})}
        />
        <Stat
          label="Open / Unresolved"
          value={open.toLocaleString('en-IN')}
          hint={`${pct(open, a.total)}% of reported`}
          change={changeOf(open, a.previous.open)}
          href={drill({ open: '1' })}
        />
        <Stat
          label="Resolved"
          value={`${pct(a.byStatus.RESOLVED, a.total)}%`}
          hint={`${a.byStatus.RESOLVED.toLocaleString('en-IN')} cases`}
          change={changeOf(a.byStatus.RESOLVED, a.previous.resolved)}
          href={drill({ status: 'RESOLVED' })}
        />
        <Stat
          label="Needs Review"
          value={a.needsReview.n.toLocaleString('en-IN')}
          hint="could not be read confidently"
          change={changeOf(a.needsReview.n, a.needsReview.prev)}
          href={drill({ review: '1' })}
        />
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Change is against the previous {RANGES[range].label.toLowerCase()}. Times are measured on app cases only;
        WhatsApp history has no reliable timestamps.
      </p>

      {/* ---------- B. Trends ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Critical Case Trends</CardTitle>
          <CardDescription>
            Cases reported per {bucket}. Hover or tap a column for its count; select it to list the cases of that period.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {a.total ? (
        <TrendChart
          series={a.series}
          bucket={bucket}
          // Plain data, not a callback: TrendChart is a client component and cannot be handed a function.
          periodHrefs={Object.fromEntries(a.series.map((s) => [s.bucket, drill({ bucket: s.bucket, bucketRange: bucket })]))}
        />
      ) : (
        <Empty />
      )}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show as table</summary>
            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Period</th>
                    <th className="px-3 py-1.5 text-right font-medium">Reported</th>
                    <th className="px-3 py-1.5 text-right font-medium">Still open</th>
                    <th className="px-3 py-1.5 text-right font-medium">Resolved</th>
                  </tr>
                </thead>
                <tbody>
                  {[...a.statusSeries].reverse().map((s) => (
                    <tr key={s.bucket} className="border-t">
                      <td className="px-3 py-1.5">
                        <Link className="hover:underline" href={drill({ bucket: s.bucket, bucketRange: bucket })}>
                          {bucketTitle(s.bucket, bucket)}
                        </Link>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{s.reported}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{s.open}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{s.resolved}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </CardContent>
      </Card>

      {a.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Where cases stand</CardTitle>
            <CardDescription>Current status of the cases reported in this period.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={STATUS_ORDER.map((s) => `${STATUS_LABELS[s]} ${a.byStatus[s]}`).join(', ')}>
              {STATUS_ORDER.filter((s) => a.byStatus[s]).map((s) => (
                <div key={s} className={STATUS_FILL[s]} style={{ flexGrow: a.byStatus[s] }} title={`${STATUS_LABELS[s]}: ${a.byStatus[s]}`} />
              ))}
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STATUS_ORDER.map((s) => (
                <li key={s}>
                  <Link href={drill({ status: s })} className="flex items-start gap-2 rounded-lg p-1 hover:bg-accent/50">
                    <span aria-hidden className={cn('mt-1 size-2.5 shrink-0 rounded-[3px]', STATUS_FILL[s])} />
                    <span>
                      <span className="block text-sm text-muted-foreground">{STATUS_LABELS[s]}</span>
                      <span className="text-lg font-semibold">{a.byStatus[s].toLocaleString('en-IN')}</span>
                      <span className="ml-1.5 text-xs text-muted-foreground">{pct(a.byStatus[s], a.total)}%</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ---------- C/D/E. Top problems, problematic tiles, people ---------- */}
      <div className="grid gap-5 sm:gap-6 lg:grid-cols-2">
        <RankCard
          title="Top Critical Issues"
          description="The problems behind the most cases. Select a row to see those cases."
          total={a.total}
          items={a.issues.map((r) => ({
            key: r.key,
            label: ISSUE_LABELS[r.key as IssueType] ?? r.key,
            n: r.n,
            change: changeOf(r.n, r.prev),
            href: drill({ issue: r.key }),
          }))}
        />
        <RankCard
          title="Most Problematic Tiles"
          description="Tiles with the most critical cases. Select a tile to see its cases."
          total={a.total}
          items={a.tiles.map((r) => ({
            key: r.key,
            label: r.key,
            sub: r.label,
            n: r.n,
            change: changeOf(r.n, r.prev),
            href: drill({ tile: r.key }),
          }))}
        />
        <RankCard
          title="Reporting Patterns — by Person"
          description="Who reports the most cases. Only people named in the data are listed."
          total={a.total}
          items={a.reporters.map((r) => ({
            key: r.key,
            label: r.key,
            n: r.n,
            change: changeOf(r.n, r.prev),
            href: drill({ reporter: r.key }),
          }))}
        />
        <RankCard
          title="Reporting Patterns — by Period"
          description="Cases per calendar month, across the whole history rather than the selected range."
          total={a.total}
          items={a.byMonth.map((r) => ({
            key: r.key,
            label: monthLabel(r.key),
            n: r.n,
            href: drill({ from: `${r.key}-01`, to: `${r.key}-31` }),
          }))}
        />
        <RankCard
          title="Cases Resolved By"
          description="Supply team members who resolved cases in this period."
          total={a.total}
          items={a.resolvers.map((r) => ({ key: r.key, label: r.key, n: r.n, href: drill({ status: 'RESOLVED', resolver: r.key }) }))}
        />
        <RankCard
          title="Vendors"
          description="Vendor of the reported tile, across the selected range."
          total={a.total}
          items={a.vendors.map((r) => ({
            key: r.key,
            label: r.key,
            n: r.n,
            change: changeOf(r.n, r.prev),
            href: drill({ vendor: r.key }),
          }))}
        />
      </div>

      {/* ---------- F. Needs Review ---------- */}
      <Card className="border-amber-300 dark:border-amber-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TriangleAlert className="size-4 text-amber-600" aria-hidden /> Needs Review
          </CardTitle>
          <CardDescription>
            Cases that could not be read confidently — missing tile code, unclear issue, unknown reporter or a low
            confidence extraction. They stay in the analytics and stay reviewable; nothing is discarded.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={drill({ review: '1' })}
              className="rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:border-primary/40"
            >
              {a.needsReview.n.toLocaleString('en-IN')} case{a.needsReview.n === 1 ? '' : 's'} need review
              <span className="ml-1.5 text-xs text-muted-foreground">{pct(a.needsReview.n, a.total)}% of the period</span>
            </Link>
            {a.awaitingListing > 0 && (
              <span className="rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
                {a.awaitingListing.toLocaleString('en-IN')} app case{a.awaitingListing === 1 ? '' : 's'} still waiting for
                the Listing team
              </span>
            )}
          </div>
          {a.needsReview.reasons.length ? (
            <ul className="grid gap-1.5">
              {a.needsReview.reasons.map((r) => (
                <li key={r.key}>
                  <Link
                    href={drill({ review: '1', reason: r.key })}
                    className="flex items-baseline justify-between gap-3 rounded-lg px-2 py-1 text-sm hover:bg-accent/50"
                  >
                    <span className="min-w-0 truncate">{reviewReasonLabel(r.key)}</span>
                    <span className="shrink-0 tabular-nums">{r.n.toLocaleString('en-IN')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing in this period needs review.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Median time to first action {formatHours(a.medianPickupHours)} · median time to resolve{' '}
            {formatHours(a.medianResolveHours)} (app cases only)
          </p>
        </CardContent>
      </Card>

      {/* ---------- Case Explorer ---------- */}
      <CaseExplorer values={fromParams(params)} base={dashboard} bucket={bucket} />
    </div>
  );
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} ${String(y).slice(2)}`;
}

function Segmented({ label, items, value }: { label: string; items: { key: string; label: string; href: string }[]; value: string }) {
  return (
    <nav aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-lg border bg-card p-0.5 shadow-xs">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={i.key === value ? 'true' : undefined}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
            i.key === value && 'bg-primary text-primary-foreground hover:text-primary-foreground',
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * A headline number. The whole card is a link into the Case Explorer, so a metric can never be a
 * dead end; the change indicator compares it with the previous period of the same length.
 */
function Stat({
  label,
  value,
  hint,
  change,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  change: ReturnType<typeof changeOf>;
  href: string;
}) {
  return (
    <Link href={href} className="rounded-xl border bg-card p-3 shadow-xs transition-colors hover:border-primary/40 sm:p-5">
      <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
      <p className="mt-1 text-2xl font-semibold sm:text-3xl">{value}</p>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
        <span>{hint}</span>
        <Change change={change} />
      </p>
    </Link>
  );
}

/** "+40% vs previous period", with an arrow. "new" when there was nothing to compare against. */
function Change({ change }: { change: ReturnType<typeof changeOf> }) {
  if (change.pct === null && change.dir !== 'up') return null;
  return (
    <span
      className={cn(
        'font-medium',
        change.dir === 'up' ? 'text-emerald-600 dark:text-emerald-400' : change.dir === 'down' ? 'text-rose-600 dark:text-rose-400' : '',
      )}
      title={`vs the previous period: ${changeLabel(change)}`}
    >
      {change.dir === 'up' ? '↑' : change.dir === 'down' ? '↓' : '→'} {changeLabel(change)}
    </span>
  );
}

/** Ranked horizontal bars with the share of total and the change, each row a link to its cases. */
function RankCard({
  title,
  description,
  items,
  total,
}: {
  title: string;
  description: string;
  total: number;
  items: { key: string; label: string; sub?: string | null; n: number; change?: ReturnType<typeof changeOf>; href: string }[];
}) {
  const max = Math.max(1, ...items.map((i) => i.n));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ol className="grid gap-2">
            {items.map((i) => (
              <li key={i.key}>
                <Link href={i.href} className="group grid gap-1 rounded-md p-1 hover:bg-accent/50" title={`${i.label}: ${i.n} cases`}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      {i.label}
                      {i.sub && <span className="ml-1.5 text-xs text-muted-foreground">{i.sub}</span>}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      {i.change && <Change change={i.change} />}
                      <span className="font-medium tabular-nums">{i.n.toLocaleString('en-IN')}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{pct(i.n, total)}%</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-opacity group-hover:opacity-80"
                      style={{ width: `${Math.max(2, (i.n / max) * 100)}%` }}
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <Empty />
        )}
      </CardContent>
    </Card>
  );
}

function Empty() {
  return <p className="py-6 text-center text-sm text-muted-foreground">No cases in this period.</p>;
}