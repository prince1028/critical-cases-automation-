import 'server-only';
import { parseSkuSheet, searchSkus, topValues, type SkuItem } from '@/lib/sku-sheet';

/**
 * The item master is read straight from the Google Sheet (CSV export), never copied into the database.
 * Each server instance keeps the parsed sheet in memory for TTL_MS and refreshes it in the background;
 * if Google is unreachable the last good copy keeps being used. Edits to the sheet show up within TTL_MS.
 */
const TTL_MS = 15 * 60 * 1000;
const DEFAULT_URL = 'https://docs.google.com/spreadsheets/d/111ZopPXaLQLvIBqHrlwv-mXZuomFbXZbgx0wTS3Kk-k/export?format=csv';

interface Loaded {
  items: SkuItem[];
  byCode: Map<string, SkuItem>;
  options: { size: string[]; finish: string[]; body: string[]; color: string[] };
  at: number;
}

const g = globalThis as unknown as { __skuSheet?: Loaded; __skuSheetLoading?: Promise<Loaded> };

async function readSource(): Promise<string> {
  // Browser tests use a small local copy, so they don't depend on Google or on the live sheet's contents.
  const file = process.env.SKU_SHEET_FILE;
  if (file) {
    const { readFile } = await import('node:fs/promises');
    return readFile(file, 'utf8');
  }
  const res = await fetch(process.env.SKU_SHEET_CSV_URL || DEFAULT_URL, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.includes('csv')) {
    throw new Error(`Item sheet download failed (${res.status} ${type}). Is the sheet still shared with "anyone with the link"?`);
  }
  return res.text();
}

async function load(): Promise<Loaded> {
  const items = parseSkuSheet(await readSource());
  return {
    items,
    byCode: new Map(items.map((i) => [i.code.toLowerCase(), i])),
    options: { size: topValues(items, 'size'), finish: topValues(items, 'finish'), body: topValues(items, 'body'), color: topValues(items, 'color') },
    at: Date.now(),
  };
}

function refresh(): Promise<Loaded> {
  g.__skuSheetLoading ??= load()
    .then((l) => (g.__skuSheet = l))
    .finally(() => (g.__skuSheetLoading = undefined));
  return g.__skuSheetLoading;
}

/** The parsed sheet. Waits only when nothing is loaded yet; a stale copy is served while refreshing. */
async function sheet(): Promise<Loaded> {
  const cur = g.__skuSheet;
  if (!cur) return refresh();
  if (Date.now() - cur.at > TTL_MS) refresh().catch((e) => console.error('Item sheet refresh failed; using the previous copy:', e));
  return cur;
}

export async function searchSkuSheet(query: string, limit = 20) {
  return searchSkus((await sheet()).items, query, limit);
}

/** One item by its Florzy Code (case-insensitive), or null if the sheet has no such code. */
export async function getSku(code: string): Promise<SkuItem | null> {
  return (await sheet()).byCode.get(code.trim().toLowerCase()) ?? null;
}

/** Common sizes, finishes and bodies from the sheet, for suggestions when the tile isn't in it. */
export async function skuFieldOptions() {
  return (await sheet()).options;
}
