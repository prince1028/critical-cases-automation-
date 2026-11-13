'use client';

import Link from 'next/link';
import { useState } from 'react';
import { bucketLabel, bucketTitle, niceTicks, type Bucket } from '@/lib/analytics';
import { cn } from '@/lib/utils';

const plural = (n: number) => `${n.toLocaleString('en-IN')} case${n === 1 ? '' : 's'}`;

/**
 * Cases reported per day/week/month: one series, so one colour and no legend.
 *
 * Hover or focus a column for its value; when `periodHrefs` has an entry for a bucket that column is
 * also a link into the Case Explorer for exactly that period, which is how the chart drills down.
 *
 * The links arrive as a plain bucket -> href record rather than a callback: this is a client
 * component, so a function prop could not be passed to it from the server component that renders it.
 */
export function TrendChart({
  series,
  bucket,
  periodHrefs,
}: {
  series: { bucket: string; n: number }[];
  bucket: Bucket;
  periodHrefs?: Record<string, string>;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...series.map((s) => s.n));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const peak = series.findIndex((s) => s.n === max && max > 0);
  const every = Math.max(1, Math.ceil(series.length / 6));
  const shown = active ?? null;
  const drillable = series.some((s) => periodHrefs?.[s.bucket]);

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-2 pt-2">
      {/* Y axis */}
      <div className="relative h-48 w-7 text-right text-[11px] tabular-nums text-muted-foreground">
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(t / top) * 100}%` }}>
            {t.toLocaleString('en-IN')}
          </span>
        ))}
      </div>

      <div className="relative h-48" onPointerLeave={() => setActive(null)}>
        {ticks.map((t) => (
          <div
            key={t}
            aria-hidden
            className={cn('absolute inset-x-0 h-px', t === 0 ? 'bg-border' : 'bg-chart-grid')}
            style={{ bottom: `${(t / top) * 100}%` }}
          />
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {series.map((s, i) => (
            <Column
              key={s.bucket}
              dimmed={shown !== null && shown !== i}
              showCount={i === peak && shown === null}
              label={`${bucketTitle(s.bucket, bucket)}: ${plural(s.n)}`}
              count={s.n}
              top={top}
              href={periodHrefs?.[s.bucket]}
              onActivate={() => setActive(i)}
              onBlur={() => setActive(null)}
            />
          ))}
        </div>

        {shown !== null && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
            style={{
              left: `clamp(3rem, ${((shown + 0.5) / series.length) * 100}%, calc(100% - 3rem))`,
              bottom: `calc(${(series[shown].n / top) * 100}% + 8px)`,
            }}
          >
            <span className="block text-sm font-semibold">{plural(series[shown].n)}</span>
            <span className="text-muted-foreground">{bucketTitle(series[shown].bucket, bucket)}</span>
            {drillable && <span className="mt-0.5 block font-medium">Select to list these cases</span>}
          </div>
        )}
      </div>

      {/* X axis */}
      <div />
      <div className="mt-1.5 flex h-4 gap-[2px] text-[11px] text-muted-foreground">
        {series.map((s, i) => (
          <span key={s.bucket} className="relative flex-1">
            {(i % every === 0 || i === series.length - 1) && (i === series.length - 1 || series.length - 1 - i >= every / 2) && (
              <span
                className={cn(
                  'absolute whitespace-nowrap',
                  i === 0 ? 'left-0' : i === series.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2',
                )}
              >
                {bucketLabel(s.bucket, bucket)}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/** One column: a link when it can drill down, a plain button when it only reports a value. */
function Column({
  href,
  label,
  count,
  top,
  dimmed,
  showCount,
  onActivate,
  onBlur,
}: {
  href?: string;
  label: string;
  count: number;
  top: number;
  dimmed: boolean;
  showCount: boolean;
  onActivate: () => void;
  onBlur: () => void;
}) {
  return (
    <Link
      href={href ?? '#'}
      aria-label={label}
      title={label}
      aria-disabled={href ? undefined : true}
      onPointerEnter={onActivate}
      onFocus={onActivate}
      onBlur={onBlur}
      className={cn(
        'group relative flex h-full flex-1 items-end justify-center rounded-sm outline-none focus-visible:bg-muted',
        href ? 'cursor-pointer hover:bg-muted/60' : 'cursor-default',
      )}
    >
      {showCount && (
        <span className="absolute text-[11px] font-medium text-foreground" style={{ bottom: `calc(${(count / top) * 100}% + 4px)` }}>
          {count}
        </span>
      )}
      <span
        className={cn('w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity', dimmed && 'opacity-45', href && 'group-hover:opacity-80')}
        style={{ height: `${(count / top) * 100}%` }}
      />
    </Link>
  );
}
