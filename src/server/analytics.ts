import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db, runningOnWorkers } from '@/db';
import { CASE_STATUSES, ISSUE_TYPES, type CaseStatus, type IssueType } from '@/db/schema';
import {
  addDays,
  bucketWindow,
  fillSeries,
  parseRange,
  RANGES,
  rangeWindow,
  type Bucket,
  type ExplorerParams,
  type RangeKey,
  type SourceKey,
} from '@/lib/analytics';
import { EXPLORER_PAGE_SIZE, ISSUE_LABELS, STATUS_LABELS } from '@/lib/constants';
import { ttlMemo } from '@/server/ttl-memo';

/**
 * Analytics over critical cases. A case's date is the day it was reported (historical WhatsApp cases
 * carry reported_on; app cases use created_at in India time), so imported history lands on its real dates.
 */
const CASE_DATE = sql.raw(`coalesce(c.reported_on, (c.created_at AT TIME ZONE 'Asia/Kolkata')::date)`);
const TILE_KEY = sql.raw(`coalesce(t.tile_code, nullif(trim(c.requested_tile_no), ''))`);
const REPORTER = sql.raw(`coalesce(u.name, nullif(trim(c.reported_by_name), ''))`);
// sql.raw() takes a plain string, so CASE_DATE has to be embedded with a sql template: passing it to
// sql.raw() stringifies it to "[object Object]" and Postgres rejects the query.
const DATE_TEXT = sql`to_char(${CASE_DATE}, 'YYYY-MM-DD')`;

const TOP = 8;

export interface Analytics {
  from: string | null;
  to: string;
  total: number;
  byStatus: Record<CaseStatus, number>;
  /** App cases still waiting for the Listing team (now, not limited to the range). */
  awaitingListing: number;
  /** Median hours, app cases only (historical cases have no reliable timestamps). */
  medianResolveHours: number | null;
  medianPickupHours: number | null;
  series: { bucket: string; n: number }[];
  /** Reported / still open / resolved per bucket, for the open-vs-resolved trend. */
  statusSeries: { bucket: string; reported: number; open: number; resolved: number }[];
  issues: { key: IssueType; n: number; prev: number }[];
  tiles: { key: string; label: string | null; n: number; prev: number }[];
  reporters: { key: string; n: number; prev: number }[];
  vendors: { key: string; n: number; prev: number }[];
  resolvers: { key: string; n: number }[];
  /** Cases in this period the import could not classify confidently. */
  needsReview: { n: number; prev: number; reasons: { key: string; n: number }[] };
  /** The same length of time immediately before, so every headline number can show a change. */
  previous: { from: string | null; to: string; total: number; open: number; resolved: number };
  /** Cases per calendar month, whatever the selected range: the long history at a glance. */
  byMonth: { key: string; n: number }[];
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

async function rows<T>(query: SQL): Promise<T[]> {
  return (await db.execute(query)).rows as T[];
}

/** The WHERE clause for one dashboard period, plus a helper to add a breakdown condition. */
function period(from: string | null, to: string, source: SourceKey) {
  const conds: SQL[] = [sql`${CASE_DATE} <= ${to}::date`];
  if (from) conds.unshift(sql`${CASE_DATE} >= ${from}::date`);
  if (source === 'app') conds.push(sql`c.source = 'APP'`);
  if (source === 'whatsapp') conds.push(sql`c.source = 'WHATSAPP_HISTORICAL'`);
  return {
    where: sql`WHERE ${sql.join(conds, sql` AND `)}`,
    and: (extra: SQL) => sql`WHERE ${sql.join([...conds, extra], sql` AND `)}`,
  };
}

/**
 * The ~20 aggregate queries behind one dashboard render. Memoised per isolate on Workers only: off the
 * edge each query is a new connection to Postgres, and a burst of views was enough to exhaust the
 * isolate (503 / "exceeded resource limits"). See src/server/ttl-memo.ts.
 */
export async function getAnalytics(range: RangeKey, source: SourceKey): Promise<Analytics> {
  return runningOnWorkers
    ? ttlMemo(`analytics:${range}:${source}`, () => computeAnalytics(range, source))
    : computeAnalytics(range, source);
}

async function computeAnalytics(range: RangeKey, source: SourceKey): Promise<Analytics> {
  const { days, bucket } = RANGES[range];
  const { from, to } = rangeWindow(range);
  // The equally long period immediately before the selected one, for the change indicators.
  const prevTo = from ? addDays(from, -1) : to;
  const prevFrom = from && days !== null ? addDays(from, -days) : null;

  const { where, and } = period(from, to, source);
  const { where: prevWhere, and: prevAnd } = period(prevFrom, prevTo, source);
  const unit = sql.raw(`'${bucket}'`);
  const month = sql.raw(`'month'`);

  const toN = <T extends { n: string }>(list: T[]) => list.map((r) => ({ ...r, n: Number(r.n) }));
  const byKey = (list: { key: string; n: string }[]) => new Map(list.map((r) => [r.key, Number(r.n)]));
  const withPrev = <T extends { key: string; n: number }>(list: T[], prev: Map<string, number>) =>
    list.map((r) => ({ ...r, prev: prev.get(r.key) ?? 0 }));
  const statuses = (list: { status: CaseStatus; n: string }[]) => {
    const by = { NEW: 0, IN_PROGRESS: 0, RESOLVED: 0, CANCELLED: 0 } as Record<CaseStatus, number>;
    for (const r of list) by[r.status] = Number(r.n);
    return by;
  };

  const [
    status,
    prevStatus,
    timing,
    listing,
    series,
    statusSeries,
    issues,
    prevIssues,
    tiles,
    prevTiles,
    reporters,
    prevReporters,
    vendors,
    prevVendors,
    resolvers,
    reviewN,
    reviewPrevN,
    reviewReasons,
    byMonth,
  ] = await Promise.all([
    rows<{ status: CaseStatus; n: string }>(sql`SELECT c.status, count(*) AS n FROM critical_cases c ${where} GROUP BY c.status`),
    rows<{ status: CaseStatus; n: string }>(sql`SELECT c.status, count(*) AS n FROM critical_cases c ${prevWhere} GROUP BY c.status`),
    rows<{ resolve_h: string | null; pickup_h: string | null }>(sql`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM c.resolved_at - c.created_at) / 3600)
          FILTER (WHERE c.status = 'RESOLVED' AND c.resolved_at IS NOT NULL) AS resolve_h,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM s.started_at - c.created_at) / 3600)
          FILTER (WHERE s.started_at IS NOT NULL) AS pickup_h
      FROM critical_cases c
      LEFT JOIN LATERAL (
        SELECT min(e.created_at) AS started_at FROM case_events e
        WHERE e.case_id = c.id AND e.event_type = 'STATUS_CHANGED' AND e.old_value->>'status' = 'NEW'
      ) s ON true
      ${and(sql`c.source = 'APP'`)}`),
    rows<{ n: string }>(sql`
      SELECT count(*) AS n FROM critical_cases c
      WHERE c.source = 'APP' AND c.listing_required AND c.listed_at IS NULL AND c.status IN ('NEW', 'IN_PROGRESS')`),
    rows<{ bucket: string; n: string }>(sql`
      SELECT to_char(date_trunc(${unit}, ${CASE_DATE}), 'YYYY-MM-DD') AS bucket, count(*) AS n
      FROM critical_cases c ${where} GROUP BY 1`),
    rows<{ bucket: string; reported: string; open: string; resolved: string }>(sql`
      SELECT to_char(date_trunc(${unit}, ${CASE_DATE}), 'YYYY-MM-DD') AS bucket,
             count(*) AS reported,
             count(*) FILTER (WHERE c.status IN ('NEW', 'IN_PROGRESS')) AS open,
             count(*) FILTER (WHERE c.status = 'RESOLVED') AS resolved
      FROM critical_cases c ${where} GROUP BY 1`),
    rows<{ key: IssueType; n: string }>(sql`
      SELECT c.issue_type AS key, count(*) AS n FROM critical_cases c ${where} GROUP BY 1 ORDER BY 2 DESC, 1`),
    rows<{ key: IssueType; n: string }>(sql`
      SELECT c.issue_type AS key, count(*) AS n FROM critical_cases c ${prevWhere} GROUP BY 1`),
    rows<{ key: string; label: string | null; n: string }>(sql`
      SELECT ${TILE_KEY} AS key, max(coalesce(t.name, c.requested_tile_name)) AS label, count(*) AS n
      FROM critical_cases c LEFT JOIN tiles t ON t.id = c.tile_id
      ${and(sql`${TILE_KEY} IS NOT NULL`)}
      GROUP BY 1 ORDER BY 3 DESC, 1 LIMIT ${TOP}`),
    rows<{ key: string; n: string }>(sql`
      SELECT ${TILE_KEY} AS key, count(*) AS n
      FROM critical_cases c LEFT JOIN tiles t ON t.id = c.tile_id
      ${and(sql`${TILE_KEY} IS NOT NULL`)} GROUP BY 1`),
    rows<{ key: string; n: string }>(sql`
      SELECT ${REPORTER} AS key, count(*) AS n
      FROM critical_cases c LEFT JOIN users u ON u.id = c.reported_by
      ${where} GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT ${TOP}`),
    rows<{ key: string; n: string }>(sql`
      SELECT ${REPORTER} AS key, count(*) AS n
      FROM critical_cases c LEFT JOIN users u ON u.id = c.reported_by
      ${prevWhere} GROUP BY 1`),
    rows<{ key: string; n: string }>(sql`
      SELECT trim(c.tile_vendor) AS key, count(*) AS n FROM critical_cases c
      ${and(sql`nullif(trim(c.tile_vendor), '') IS NOT NULL`)} GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT ${TOP}`),
    rows<{ key: string; n: string }>(sql`
      SELECT trim(c.tile_vendor) AS key, count(*) AS n FROM critical_cases c
      ${prevAnd(sql`nullif(trim(c.tile_vendor), '') IS NOT NULL`)} GROUP BY 1`),
    // Who resolved cases in the range (by the day of the resolution, India time).
    rows<{ key: string; n: string }>(sql`
      SELECT u.name AS key, count(DISTINCT e.case_id) AS n
      FROM case_events e JOIN users u ON u.id = e.user_id
      WHERE e.event_type = 'STATUS_CHANGED' AND e.new_value->>'status' = 'RESOLVED'
        ${from ? sql`AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN ${from}::date AND ${to}::date` : sql``}
        ${source === 'whatsapp' ? sql`AND false` : sql``}
      GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT ${TOP}`),
    rows<{ n: string }>(sql`SELECT count(*) AS n FROM critical_cases c ${and(sql`c.needs_review`)}`),
    rows<{ n: string }>(sql`SELECT count(*) AS n FROM critical_cases c ${prevAnd(sql`c.needs_review`)}`),
    rows<{ key: string; n: string }>(sql`
      SELECT r AS key, count(*) AS n FROM critical_cases c, unnest(c.review_reasons) r
      ${where} GROUP BY 1 ORDER BY 2 DESC, 1`),
    rows<{ key: string; n: string }>(sql`
      SELECT to_char(date_trunc(${month}, ${CASE_DATE}), 'YYYY-MM') AS key, count(*) AS n
      FROM critical_cases c ${where} GROUP BY 1 ORDER BY 1`),
  ]);

  const byStatus = statuses(status);
  const prev = statuses(prevStatus);
  const counted = series.map((r) => ({ bucket: r.bucket, n: Number(r.n) }));
  const first = counted.reduce<string | null>((m, r) => (!m || r.bucket < m ? r.bucket : m), null);
  const start = from ?? first ?? to;
  const filled = fillSeries(counted, start, to, bucket);

  return {
    from,
    to,
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    byStatus,
    awaitingListing: Number(listing[0]?.n ?? 0),
    medianResolveHours: num(timing[0]?.resolve_h),
    medianPickupHours: num(timing[0]?.pickup_h),
    // Future-dated rows (a typo in a historical sheet) are left out rather than stretching the axis.
    series: filled,
    statusSeries: filled.map((b) => {
      const hit = statusSeries.find((r) => r.bucket === b.bucket);
      return {
        bucket: b.bucket,
        reported: b.n,
        open: Number(hit?.open ?? 0),
        resolved: Number(hit?.resolved ?? 0),
      };
    }),
    issues: withPrev(toN(issues), byKey(prevIssues)),
    tiles: withPrev(toN(tiles), byKey(prevTiles)),
    reporters: withPrev(toN(reporters), byKey(prevReporters)),
    vendors: withPrev(toN(vendors), byKey(prevVendors)),
    resolvers: toN(resolvers),
    needsReview: {
      n: Number(reviewN[0]?.n ?? 0),
      prev: Number(reviewPrevN[0]?.n ?? 0),
      reasons: toN(reviewReasons),
    },
    previous: {
      from: prevFrom,
      to: prevTo,
      total: Object.values(prev).reduce((a, b) => a + b, 0),
      open: prev.NEW + prev.IN_PROGRESS,
      resolved: prev.RESOLVED,
    },
    byMonth: toN(byMonth),
  };
}

// ---------- Case Explorer: the cases behind every number ----------

/** One case as the explorer lists it. Read-only: nothing here can be acted on. */
export interface ExplorerCase {
  id: string;
  caseCode: string | null;
  reportedOn: string | null;
  tileCode: string | null;
  tileLabel: string | null;
  issueType: string;
  secondaryIssueTypes: string[] | null;
  status: CaseStatus;
  source: string;
  reporterName: string | null;
  needsReview: boolean;
  reviewReasons: string[] | null;
  confidence: string | null;
  description: string | null;
}

export interface ExplorerResult {
  rows: ExplorerCase[];
  total: number;
  page: number;
  pageSize: number;
  /** What narrowed the list, so a drilldown can explain itself. Each chip knows what it removes. */
  chips: { id: string; label: string; keys: string[] }[];
}

/** Escapes LIKE wildcards so a filter is matched literally. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * The read-only explorer over the same rows the dashboard aggregates. Every analytical signal
 * links here, and each row links to the case, which keeps the original WhatsApp messages in
 * `source_messages`. The tile expression is the one the dashboard groups by, so a drilldown
 * always returns exactly the cases behind the number that was clicked.
 */
export async function exploreCases(f: ExplorerParams): Promise<ExplorerResult> {
  const page = Math.max(1, Math.min(10_000, Number(f.page) || 1));
  const conds: SQL[] = [];

  // The dashboard's own range scopes the list too, so a drilldown returns exactly the cases behind
  // the number that was clicked. An explicit from/to (a chart column, the date fields) wins over it.
  if (!f.from && !f.to && !f.bucket) {
    const window = rangeWindow(parseRange(f.range));
    if (window.from) conds.push(sql`${CASE_DATE} >= ${window.from}::date`);
    conds.push(sql`${CASE_DATE} <= ${window.to}::date`);
  }
  if (f.from) conds.push(sql`${CASE_DATE} >= ${f.from}::date`);
  if (f.to) conds.push(sql`${CASE_DATE} <= ${f.to}::date`);
  if (f.tile) {
    const p = `%${escapeLike(f.tile)}%`;
    conds.push(sql`(${TILE_KEY} ILIKE ${p} OR c.requested_tile_name ILIKE ${p})`);
  }
  if (f.issue && (ISSUE_TYPES as readonly string[]).includes(f.issue)) {
    conds.push(sql`(c.issue_type = ${f.issue}::issue_type OR ${f.issue}::issue_type = ANY(c.secondary_issue_types))`);
  }
  if (f.status && (CASE_STATUSES as readonly string[]).includes(f.status)) conds.push(sql`c.status = ${f.status}::case_status`);
  // "Open / unresolved" on the dashboard counts New + In Progress together, so its drilldown has to
  // too - filtering on one of them would show fewer cases than the number it came from.
  if (f.open === '1') conds.push(sql`c.status IN ('NEW', 'IN_PROGRESS')`);
  if (f.vendor) conds.push(sql`trim(c.tile_vendor) ILIKE ${'%' + escapeLike(f.vendor) + '%'}`);
  // "Cases resolved by" counts people who moved a case to Resolved, which is the status-change actor
  // rather than the person who reported it.
  if (f.resolver)
    conds.push(sql`EXISTS (
      SELECT 1 FROM case_events e JOIN users ru ON ru.id = e.user_id
      WHERE e.case_id = c.id AND e.event_type = 'STATUS_CHANGED'
        AND e.new_value->>'status' = 'RESOLVED' AND ru.name ILIKE ${'%' + escapeLike(f.resolver) + '%'})`);
  if (f.reporter) conds.push(sql`${REPORTER} ILIKE ${'%' + escapeLike(f.reporter) + '%'}`);
  if (f.review === '1') conds.push(sql`c.needs_review`);
  if (f.review === '0') conds.push(sql`NOT c.needs_review`);
  if (f.reason) conds.push(sql`${f.reason} = ANY(c.review_reasons)`);
  if (f.source === 'app') conds.push(sql`c.source = 'APP'`);
  if (f.source === 'whatsapp') conds.push(sql`c.source = 'WHATSAPP_HISTORICAL'`);
  if (f.bucket && f.bucketRange && (['day', 'week', 'month'] as string[]).includes(f.bucketRange)) {
    const { from, to } = bucketWindow(f.bucket, f.bucketRange as Bucket);
    conds.push(sql`${CASE_DATE} BETWEEN ${from}::date AND ${to}::date`);
  }
  if (f.q) {
    const p = `%${escapeLike(f.q)}%`;
    conds.push(
      sql`(c.case_code ILIKE ${p} OR c.description ILIKE ${p} OR c.requested_tile_name ILIKE ${p}
            OR c.requested_tile_no ILIKE ${p} OR c.source_messages ILIKE ${p} OR c.reported_by_name ILIKE ${p}
            OR ${REPORTER} ILIKE ${p})`,
    );
  }

  const select = sql`
    SELECT c.id, c.case_code AS "caseCode", ${DATE_TEXT} AS "reportedOn",
           ${TILE_KEY} AS "tileCode", coalesce(t.name, c.requested_tile_name) AS "tileLabel",
           c.issue_type AS "issueType", c.secondary_issue_types AS "secondaryIssueTypes",
           c.status, c.source, ${REPORTER} AS "reporterName",
           c.needs_review AS "needsReview", c.review_reasons AS "reviewReasons",
           c.extraction_confidence AS confidence, c.description
    FROM critical_cases c
    LEFT JOIN tiles t ON t.id = c.tile_id
    LEFT JOIN users u ON u.id = c.reported_by
    ${conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``}`;

  const [list, [{ total }]] = await Promise.all([
    rows<ExplorerCase>(
      sql`${select} ORDER BY ${CASE_DATE} DESC, c.created_at DESC LIMIT ${EXPLORER_PAGE_SIZE} OFFSET ${(page - 1) * EXPLORER_PAGE_SIZE}`,
    ),
    rows<{ total: string }>(sql`SELECT count(*) AS total FROM (${select}) _x`),
  ]);

  // Labels come from the same tables the dashboard uses, so a chip never shows a raw enum value.
  const issueLabel = (k: string) => ISSUE_LABELS[k as IssueType] ?? k;
  const statusLabel = (k: string) => STATUS_LABELS[k as CaseStatus] ?? k;

  const chips: ExplorerResult['chips'] = [];
  if (f.from || f.to)
    chips.push({ id: 'date', label: f.from && f.to ? `${f.from} to ${f.to}` : (f.from ?? f.to)!, keys: ['from', 'to'] });
  if (f.bucket) chips.push({ id: 'bucket', label: `Period ${f.bucket}`, keys: ['bucket', 'bucketRange'] });
  if (f.tile) chips.push({ id: 'tile', label: `Tile ${f.tile}`, keys: ['tile'] });
  if (f.issue) chips.push({ id: 'issue', label: issueLabel(f.issue), keys: ['issue'] });
  if (f.status) chips.push({ id: 'status', label: statusLabel(f.status), keys: ['status'] });
  if (f.open === '1') chips.push({ id: 'open', label: 'Open (New + In Progress)', keys: ['open', 'status'] });
  if (f.vendor) chips.push({ id: 'vendor', label: `Vendor ${f.vendor}`, keys: ['vendor'] });
  if (f.resolver) chips.push({ id: 'resolver', label: `Resolved by ${f.resolver}`, keys: ['resolver'] });
  if (f.reporter) chips.push({ id: 'reporter', label: `Reported by ${f.reporter}`, keys: ['reporter'] });
  if (f.review === '1') chips.push({ id: 'review', label: 'Needs review', keys: ['review', 'reason'] });
  if (f.review === '0') chips.push({ id: 'review', label: 'Reviewed / confident', keys: ['review'] });
  if (f.reason) chips.push({ id: 'reason', label: `Review reason: ${f.reason}`, keys: ['reason'] });
  if (f.source === 'app') chips.push({ id: 'source', label: 'App cases', keys: ['source'] });
  if (f.source === 'whatsapp') chips.push({ id: 'source', label: 'WhatsApp history', keys: ['source'] });
  if (f.q) chips.push({ id: 'q', label: `Search: ${f.q}`, keys: ['q'] });

  return { rows: list, total: Number(total), page, pageSize: EXPLORER_PAGE_SIZE, chips };
}

/** Distinct values the explorer offers as filter options. Nothing invented: all read from the cases. */
export async function explorerFacets(): Promise<{ issues: { key: string; n: number }[]; reporters: string[]; tiles: string[] }> {
  return runningOnWorkers ? ttlMemo('facets', computeFacets) : computeFacets();
}

async function computeFacets(): Promise<{ issues: { key: string; n: number }[]; reporters: string[]; tiles: string[] }> {
  const [issues, reporters, tiles] = await Promise.all([
    rows<{ key: string; n: string }>(sql`
      SELECT issue_type AS key, count(*) AS n FROM critical_cases GROUP BY 1 ORDER BY 2 DESC, 1`),
    rows<{ key: string }>(sql`
      SELECT ${REPORTER} AS key FROM critical_cases c LEFT JOIN users u ON u.id = c.reported_by
      WHERE ${REPORTER} IS NOT NULL GROUP BY 1 ORDER BY 1 LIMIT 200`),
    rows<{ key: string }>(sql`
      SELECT ${TILE_KEY} AS key FROM critical_cases c LEFT JOIN tiles t ON t.id = c.tile_id
      WHERE ${TILE_KEY} IS NOT NULL GROUP BY 1 ORDER BY 1 LIMIT 500`),
  ]);
  return {
    issues: issues.map((r) => ({ key: r.key, n: Number(r.n) })),
    reporters: reporters.map((r) => r.key),
    tiles: tiles.map((r) => r.key),
  };
}