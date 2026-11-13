/** Pure helpers for the admin analytics page (no database), so they can be unit tested. */

export const RANGES = {
  '30d': { label: '30 days', days: 30, bucket: 'day' },
  '90d': { label: '90 days', days: 90, bucket: 'week' },
  '12m': { label: '12 months', days: 365, bucket: 'month' },
  all: { label: 'All time', days: null, bucket: 'month' },
} as const;
export type RangeKey = keyof typeof RANGES;
export type Bucket = (typeof RANGES)[RangeKey]['bucket'];

export const SOURCES = { all: 'All cases', app: 'App only', whatsapp: 'WhatsApp history' } as const;
export type SourceKey = keyof typeof SOURCES;

export const parseRange = (v: string | undefined): RangeKey => (v && v in RANGES ? (v as RangeKey) : '90d');
export const parseSource = (v: string | undefined): SourceKey => (v && v in SOURCES ? (v as SourceKey) : 'all');

/**
 * The date window a dashboard range covers, as inclusive bounds. `from` is null for all time.
 * The dashboard and the Case Explorer both use this, so a drilldown always lists exactly the cases
 * behind the number it was opened from.
 */
export function rangeWindow(range: RangeKey, today = todayIst()): { from: string | null; to: string } {
  // parseRange() normally runs first, but a URL is user input: an unknown key falls back to the
  // default window rather than throwing and taking the whole page down.
  const { days } = RANGES[range] ?? RANGES[parseRange(range as string)];
  return { from: days === null ? null : addDays(today, -(days - 1)), to: today };
}

/** Today's date in India as YYYY-MM-DD. */
export function todayIst(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const toDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const toYmd = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(ymd: string, n: number): string {
  const d = toDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return toYmd(d);
}

/** Start of the bucket a date falls in, matching Postgres date_trunc (weeks start on Monday). */
export function bucketStart(ymd: string, bucket: Bucket): string {
  const d = toDate(ymd);
  if (bucket === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (bucket === 'month') d.setUTCDate(1);
  return toYmd(d);
}

function nextBucket(ymd: string, bucket: Bucket): string {
  if (bucket === 'day') return addDays(ymd, 1);
  if (bucket === 'week') return addDays(ymd, 7);
  const d = toDate(ymd);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return toYmd(d);
}

/** Every bucket from `from` to `to` (inclusive), zero-filled from the counted rows. */
export function fillSeries(rows: { bucket: string; n: number }[], from: string, to: string, bucket: Bucket) {
  const by = new Map(rows.map((r) => [r.bucket, r.n]));
  const out: { bucket: string; n: number }[] = [];
  for (let b = bucketStart(from, bucket), end = bucketStart(to, bucket); b <= end; b = nextBucket(b, bucket)) {
    out.push({ bucket: b, n: by.get(b) ?? 0 });
  }
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Short axis label for a bucket: "14 Sep", or "Sep 26" for months. */
export function bucketLabel(ymd: string, bucket: Bucket): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return bucket === 'month' ? `${MONTHS[m - 1]} ${String(y).slice(2)}` : `${d} ${MONTHS[m - 1]}`;
}

/** Tooltip label: "14 Sep 2026", "Week of 14 Sep 2026", "September 2026". */
export function bucketTitle(ymd: string, bucket: Bucket): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (bucket === 'month') return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return `${bucket === 'week' ? 'Week of ' : ''}${d} ${MONTHS[m - 1]} ${y}`;
}

/** "45 min", "6.5 h", "3.2 days"; "—" when there's nothing to measure. */
export function formatHours(h: number | null): string {
  if (h === null || !Number.isFinite(h)) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${h < 10 ? h.toFixed(1).replace(/\.0$/, '') : Math.round(h)} h`;
  const days = h / 24;
  return `${days < 10 ? days.toFixed(1).replace(/\.0$/, '') : Math.round(days)} days`;
}

/** Clean axis maximum and ticks (0, 5, 10...) for a column chart. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let t = 0; t < max + step; t += step) ticks.push(Math.max(t, 0));
  return ticks.length < 2 ? [0, step] : ticks;
}

// ---------- Period-over-period change ----------

export interface Change {
  /** Signed change as a percentage, rounded to a whole number. null when there is no baseline. */
  pct: number | null;
  dir: 'up' | 'down' | 'flat';
}

/**
 * Change of `current` against `previous`. "—" when the previous period had nothing to compare
 * against (a brand new signal, or a first-ever period), never a made-up 0% or +100%.
 */
export function changeOf(current: number, previous: number): Change {
  if (previous <= 0) return { pct: null, dir: current > 0 ? 'up' : 'flat' };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

/** "+40%", "-12%", "new", "—". The compact form shown next to a metric. */
export function changeLabel(change: Change): string {
  if (change.pct === null) return change.dir === 'up' ? 'new' : '—';
  return `${change.pct > 0 ? '+' : ''}${change.pct}%`;
}

// ---------- Case Explorer (source-of-truth drilldown) ----------

/** The analytics page URL, kept in one place so drilldowns and filters cannot drift apart. */
export const ANALYTICS_HREF = '/analytics';

/**
 * Every filter the read-only Case Explorer understands. The explorer is part of the analytics
 * page, so it shares its URL: any analytics signal links to the cases behind it.
 */
export const EXPLORER_KEYS = [
  'range',
  'source',
  'from',
  'to',
  'tile',
  'issue',
  'status',
  'open',
  'vendor',
  'resolver',
  'reporter',
  'review',
  'reason',
  'bucket',
  'bucketRange',
  'q',
  'page',
] as const;
export type ExplorerKey = (typeof EXPLORER_KEYS)[number];
export type ExplorerParams = Partial<Record<ExplorerKey, string>>;

/** Filters that narrow the explorer. `page`, `q` and the dashboard's own range/source are handled separately. */
export const EXPLORER_FILTER_KEYS: ExplorerKey[] = [
  'from',
  'to',
  'tile',
  'issue',
  'status',
  'open',
  'vendor',
  'resolver',
  'reporter',
  'review',
  'reason',
  'bucket',
  'bucketRange',
];

/** Every filter but "all sources", which is the default and never worth a chip. */
export const isFiltered = (f: ExplorerParams) => EXPLORER_FILTER_KEYS.some((k) => k !== 'source' && f[k]);

/** Drops empty values so links stay short and stable. */
export const explorerQuery = (params: ExplorerParams): string => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  return q.toString();
};

/**
 * The drilldown URL for one analytical signal: the same analytics page, scrolled to the
 * explorer and narrowed to the cases behind the number. `base` keeps the current dashboard
 * filters (range/source) so the explorer explains what the reader was looking at.
 */
export function explorerHref(base: ExplorerParams, filter: ExplorerParams = {}): string {
  const merged: ExplorerParams = { ...base };
  for (const [k, v] of Object.entries(filter)) {
    if (v) merged[k as ExplorerKey] = v;
    else delete merged[k as ExplorerKey];
  }
  delete merged.page;
  const query = explorerQuery(merged);
  return `${ANALYTICS_HREF}${query ? `?${query}` : ''}#explorer`;
}

/** Bounds of a trend bucket, so clicking a chart column lists the cases inside that period. */
export function bucketWindow(ymd: string, bucket: Bucket): { from: string; to: string } {
  const from = bucketStart(ymd, bucket);
  return { from, to: lastDayOf(from, bucket) };
}

function lastDayOf(ymd: string, bucket: Bucket): string {
  if (bucket === 'month') {
    const [y, m] = ymd.split('-').map(Number);
    return toYmd(new Date(Date.UTC(y, m, 0))); // day 0 of the next month = last day of this one
  }
  return addDays(ymd, bucket === 'week' ? 6 : 0);
}
