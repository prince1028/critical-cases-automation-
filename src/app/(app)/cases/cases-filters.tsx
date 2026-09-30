'use client';

import { Loader2, Search, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_LABELS } from '@/lib/constants';

const ALL = '__all__';

export function CasesFilters({ allowAll, scope, q, status }: { allowAll: boolean; scope: 'mine' | 'all'; q: string; status: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(q);

  // Query string of the navigation in flight (the address bar only changes once it commits), so a
  // debounced search can't undo a filter chosen a moment earlier.
  const pendingQuery = useRef<string | null>(null);
  useEffect(() => {
    pendingQuery.current = null; // navigation committed; the URL is current again
  }, [q, status, scope]);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(pendingQuery.current ?? window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete('page'); // any filter change goes back to page 1
    pendingQuery.current = next.toString();
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ''}`));
  };

  // Debounced search.
  useEffect(() => {
    if (text === q) return;
    const t = setTimeout(() => update({ q: text.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search case code, tile, description…"
          className="pr-9 pl-9"
          aria-label="Search cases"
        />
        {pending ? (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          text && (
            <button
              type="button"
              onClick={() => setText('')}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )
        )}
      </div>
      <Select value={status || ALL} onValueChange={(v) => update({ status: v === ALL ? null : v })}>
        <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {allowAll && (
        <div className="inline-flex rounded-md border bg-background p-0.5" role="group" aria-label="Which cases">
          {(['mine', 'all'] as const).map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={scope === s ? 'secondary' : 'ghost'}
              aria-pressed={scope === s}
              onClick={() => update({ scope: s })}
            >
              {s === 'mine' ? 'My cases' : 'All cases'}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
