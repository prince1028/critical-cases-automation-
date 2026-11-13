'use client';

import { Loader2, Search, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EXPLORER_FILTER_KEYS, explorerHref, type ExplorerParams } from '@/lib/analytics';
import { ISSUE_LABELS, STATUS_LABELS } from '@/lib/constants';

const ALL = '__all__';

/**
 * Filter bar of the read-only Case Explorer. It works on the analytics URL, so the dashboard keeps
 * its own range/source filters and the explorer list always explains the number it was opened from.
 */
export function ExplorerFilters({
  values,
  base,
  issues,
  reporters,
  tiles,
}: {
  values: ExplorerParams;
  base: ExplorerParams;
  issues: { key: string; n: number }[];
  reporters: string[];
  tiles: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [tile, setTile] = useState(values.tile ?? '');
  const [reporter, setReporter] = useState(values.reporter ?? '');
  const [from, setFrom] = useState(values.from ?? '');
  const [to, setTo] = useState(values.to ?? '');
  const [search, setSearch] = useState(values.q ?? '');

  // The query string of the navigation in flight, so a debounced field can't undo a dropdown.
  const pendingQuery = useRef<Record<string, string>>({ ...values });
  useEffect(() => {
    pendingQuery.current = { ...values };
    setTile(values.tile ?? '');
    setReporter(values.reporter ?? '');
    setFrom(values.from ?? '');
    setTo(values.to ?? '');
    setSearch(values.q ?? '');
  }, [values]);

  const update = (patch: Record<string, string | null>) => {
    const next = { ...pendingQuery.current };
    for (const [k, v] of Object.entries(patch)) {
      if (v) next[k] = v;
      else delete next[k];
    }
    delete next.page;
    pendingQuery.current = next;
    startTransition(() => router.replace(explorerHref({ ...base, ...next })));
  };

  // Debounced free-text fields.
  useEffect(() => {
    if (tile === (values.tile ?? '')) return;
    const t = setTimeout(() => update({ tile: tile.trim() || null }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tile]);

  useEffect(() => {
    if (reporter === (values.reporter ?? '')) return;
    const t = setTimeout(() => update({ reporter: reporter.trim() || null }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reporter]);

  useEffect(() => {
    if (from === (values.from ?? '') && to === (values.to ?? '')) return;
    const t = setTimeout(() => update({ from: from || null, to: to || null }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  useEffect(() => {
    if (search === (values.q ?? '')) return;
    const t = setTimeout(() => update({ q: search.trim() || null }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  void pathname;

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
        <label className="grid gap-1 text-xs text-muted-foreground">
          From
          <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          To
          <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <label className="grid gap-1 text-xs text-muted-foreground">
        Tile code
        <div className="relative">
          {tiles.length > 0 ? (
            <Select value={tile || undefined} onValueChange={(v) => setTile(v === ALL ? '' : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Any tile" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any tile</SelectItem>
                {tiles.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={tile} onChange={(e) => setTile(e.target.value)} placeholder="Tile code or name" className="pl-9" />
            </div>
          )}
        </div>
      </label>

      <label className="grid gap-1 text-xs text-muted-foreground">
        Issue type
        <Select
          value={values.issue || ALL}
          onValueChange={(v) => update({ issue: v === ALL ? null : v, page: null })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Any issue" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any issue</SelectItem>
            {issues.map((i) => (
              <SelectItem key={i.key} value={i.key}>
                {ISSUE_LABELS[i.key as keyof typeof ISSUE_LABELS] ?? i.key} ({i.n.toLocaleString('en-IN')})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Status
          <Select value={values.status || ALL} onValueChange={(v) => update({ status: v === ALL ? null : v })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="grid gap-1 text-xs text-muted-foreground">
          Review
          <Select value={values.review || ALL} onValueChange={(v) => update({ review: v === ALL ? null : v, reason: null })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any</SelectItem>
              <SelectItem value="1">Needs review</SelectItem>
              <SelectItem value="0">Reviewed</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>

      <label className="grid gap-1 text-xs text-muted-foreground">
        Reporter
        {reporters.length > 0 ? (
          <Select value={reporter || undefined} onValueChange={(v) => setReporter(v === ALL ? '' : v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Anyone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Anyone</SelectItem>
              {reporters.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input value={reporter} onChange={(e) => setReporter(e.target.value)} placeholder="Name as reported" />
        )}
      </label>

      <label className="grid gap-1 text-xs text-muted-foreground">
        Source
        <Select value={values.source || ALL} onValueChange={(v) => update({ source: v === ALL ? null : v })}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All cases" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All cases</SelectItem>
            <SelectItem value="app">App only</SelectItem>
            <SelectItem value="whatsapp">WhatsApp history</SelectItem>
          </SelectContent>
        </Select>
      </label>

      <label className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">
        Search the cases themselves
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Case code, description, or words in the original WhatsApp message" className="pl-9 pr-9" />
          {pending && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
      </label>

      {pending && <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">Updating…</p>}
      <ResetFilters base={base} values={values} keys={EXPLORER_FILTER_KEYS} />
    </div>
  );
}

/** Clears the explorer's own filters and keeps the dashboard's range/source. */
function ResetFilters({ base, values, keys }: { base: ExplorerParams; values: ExplorerParams; keys: readonly string[] }) {
  const router = useRouter();
  const active = keys.some((k) => k !== 'source' && values[k as keyof ExplorerParams]);
  if (!active) return null;
  return (
    <div className="sm:col-span-2 lg:col-span-4">
      <Button variant="ghost" size="sm" onClick={() => router.replace(explorerHref(base))}>
        <X /> Clear explorer filters
      </Button>
    </div>
  );
}