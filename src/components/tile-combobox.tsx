'use client';

import { Check, ChevronsUpDown, Loader2, SearchX, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface TileOption {
  id: string;
  tileCode: string;
  name: string | null;
  brand: string | null;
  color: string | null;
  size: string | null;
  finish: string | null;
  supplier: string | null;
  currentStock: string | null;
}

const describe = (t: TileOption) => [t.name, t.brand, t.color, t.size, t.finish].filter(Boolean).join(' · ');

/** Searchable tile picker backed by /api/tiles (server-side search of the tiles table). */
export function TileCombobox({
  value,
  onChange,
  invalid,
  disabled,
}: {
  value: TileOption | null;
  onChange: (tile: TileOption | null) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TileOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tiles?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
        const body = await res.json();
        if (id !== reqId.current) return;
        if (!res.ok) throw new Error(body.error ?? 'Search failed');
        setResults(body.tiles);
        setError(null);
      } catch (e) {
        if (id === reqId.current) setError(e instanceof Error ? e.message : 'Search failed');
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          disabled={disabled}
          className={cn('h-auto min-h-11 w-full justify-between px-3 py-2 text-left font-normal', invalid && 'border-destructive')}
        >
          {value ? (
            <span className="min-w-0">
              <span className="font-mono font-semibold">{value.tileCode}</span>
              {describe(value) && <span className="ml-2 truncate text-muted-foreground">{describe(value)}</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">Search tile code, name, brand, colour…</span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Type a tile code or name…" value={query} onValueChange={setQuery} />
          <CommandList>
            {loading && (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Searching…
              </div>
            )}
            {!loading && error && <div className="px-3 py-3 text-sm text-destructive">{error}</div>}
            {!loading && !error && (
              <CommandEmpty>
                <div className="flex flex-col items-center gap-1 text-sm">
                  <SearchX className="size-5 text-muted-foreground" />
                  No tile matches “{query}”.
                  <span className="text-xs text-muted-foreground">Use “Tile not found” below if it isn’t in the list.</span>
                </div>
              </CommandEmpty>
            )}
            {!loading && !error && results.length > 0 && (
              <CommandGroup heading={query ? 'Matching tiles' : 'Tiles'}>
                {results.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={t.id}
                    onSelect={() => {
                      onChange(t);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('size-4', value?.id === t.id ? 'opacity-100' : 'opacity-0')} />
                    <div className="min-w-0">
                      <div className="font-mono font-medium">{t.tileCode}</div>
                      {describe(t) && <div className="truncate text-xs text-muted-foreground">{describe(t)}</div>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function SelectedTileCard({ tile, onClear }: { tile: TileOption; onClear: () => void }) {
  const rows: [string, string | null][] = [
    ['Name', tile.name],
    ['Brand', tile.brand],
    ['Supplier', tile.supplier],
    ['Colour', tile.color],
    ['Size', tile.size],
    ['Finish', tile.finish],
    ['Current Stock', tile.currentStock !== null ? Number(tile.currentStock).toLocaleString('en-IN') : null],
  ];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">
          Tile <span className="font-mono">{tile.tileCode}</span>
        </p>
        <Button type="button" variant="ghost" size="icon" className="-mt-1 -mr-1 size-7" onClick={onClear} aria-label="Clear selected tile">
          <X />
        </Button>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map(([label, v]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}:</dt>
            <dd className={cn(!v && 'text-muted-foreground')}>{v ?? 'Not recorded'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
