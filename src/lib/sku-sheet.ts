/**
 * The item master lives in a Google Sheet (published as CSV), not in our database. This module turns the
 * CSV into items and searches them; src/server/sku-sheet.ts fetches and caches it.
 */
export interface SkuItem {
  /** Florzy Code, exactly as in the sheet (text: keeps leading zeroes). */
  code: string;
  name: string;
  status: string | null;
  vendor: string | null;
  size: string | null;
  finish: string | null;
  /** Material Type: Vitrified, Ceramic, Full Body Vitrified... */
  body: string | null;
  /** Only when the sheet has a colour column. */
  color: string | null;
  thickness: string | null;
}

/** Lowercased text searched for each item: its own fields, joined. Built on first search, then reused. */
const haystacks = new WeakMap<SkuItem, string>();
const haystack = (i: SkuItem) => {
  let h = haystacks.get(i);
  if (h === undefined) {
    h = `${i.code} ${i.name} ${i.vendor ?? ''} ${i.size ?? ''} ${i.finish ?? ''} ${i.body ?? ''} ${i.color ?? ''}`.toLowerCase();
    haystacks.set(i, h);
  }
  return h;
};

export class SkuSheetError extends Error {}

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and line breaks. Regex-driven for speed. */
export function parseCsv(text: string): string[][] {
  // Fast path, line by line: most rows have no quotes, so a plain split is exact; quoted rows use the regex.
  // A quoted field spanning lines (odd quote count on a line) falls back to parsing the whole text.
  const rows: string[][] = [];
  for (const line of text.split(/\r\n|\n|\r/)) {
    if (!line.includes('"')) rows.push(line.split(','));
    else if ((line.match(/"/g)?.length ?? 0) % 2) return parseCsvSlow(text);
    else rows.push(parseCsvSlow(line)[0] ?? ['']);
  }
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
}

function parseCsvSlow(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  const re = /("(?:[^"]|"")*"|[^,\r\n]*)(,|\r\n|\n|\r|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[1];
    row.push(raw.charCodeAt(0) === 34 ? raw.slice(1, -1).replace(/""/g, '"') : raw);
    const sep = m[2];
    if (sep !== ',') {
      rows.push(row);
      row = [];
      if (sep === '') break;
    }
  }
  // A trailing line break leaves one empty row behind.
  const last = rows[rows.length - 1];
  if (last && last.length === 1 && last[0] === '') rows.pop();
  return rows;
}

/** Header names we read, matched case- and space-insensitively. Florzy Code and Sku Name are required. */
const COLUMNS: Record<keyof SkuItem, string[]> = {
  code: ['florzy code', 'florzy id', 'tile code', 'code'],
  name: ['sku name', 'name', 'tile name'],
  status: ['web status', 'status'],
  vendor: ['vendor name', 'vendor', 'brand'],
  size: ['dimension', 'size'],
  finish: ['finish'],
  body: ['material type', 'body', 'tile body'],
  color: ['colour', 'color', 'tile colour', 'tile color'],
  thickness: ['thickness'],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function parseSkuSheet(csv: string): SkuItem[] {
  const [header, ...rows] = parseCsv(csv.replace(/^﻿/, ''));
  if (!header) throw new SkuSheetError('The item sheet is empty');
  const heads = header.map(norm);
  const idx = Object.fromEntries(
    Object.entries(COLUMNS).map(([k, names]) => [k, heads.findIndex((h) => names.includes(h))]),
  ) as Record<keyof SkuItem, number>;
  if (idx.code < 0 || idx.name < 0) {
    throw new SkuSheetError('The item sheet must have “Florzy Code” and “Sku Name” columns. Was a column renamed?');
  }
  const cell = (r: string[], k: keyof SkuItem) => (idx[k] < 0 ? null : r[idx[k]]?.trim() || null);
  const items: SkuItem[] = [];
  for (const r of rows) {
    const code = cell(r, 'code');
    if (!code) continue;
    const item: SkuItem = {
      code,
      name: cell(r, 'name') ?? '',
      status: cell(r, 'status'),
      vendor: cell(r, 'vendor'),
      size: cell(r, 'size'),
      finish: cell(r, 'finish'),
      body: cell(r, 'body'),
      color: cell(r, 'color'),
      thickness: cell(r, 'thickness'),
    };
    items.push(item);
  }
  return items;
}

/**
 * Items matching every word of the query (in code, name, vendor, size, finish or body). Exact code first,
 * then codes starting with the query, then the rest; discontinued items after active ones.
 */
export function searchSkus(items: SkuItem[], query: string, limit = 20): SkuItem[] {
  const q = norm(query);
  if (!q) return items.filter((i) => i.status !== 'Discontinued').slice(0, limit);
  const words = q.split(' ');
  // Ranks: 0 exact code, 1 code prefix, 2 other match; +3 when discontinued. Keep the first `limit` of each
  // rank in sheet order, so a broad query ("vitrified") never sorts thousands of matches.
  const ranks: SkuItem[][] = [[], [], [], [], [], []];
  for (const item of items) {
    const hay = haystack(item);
    if (!words.every((w) => hay.includes(w))) continue;
    const code = item.code.toLowerCase();
    const rank = (code === q ? 0 : code.startsWith(q) ? 1 : 2) + (item.status === 'Discontinued' ? 3 : 0);
    if (ranks[rank].length < limit) ranks[rank].push(item);
  }
  ranks[1].sort((a, b) => a.code.length - b.code.length || (a.code < b.code ? -1 : 1)); // 72 → 720, 724, 7240
  return ranks.flat().slice(0, limit);
}

/** Distinct values of a field, most used first: suggestions for the form when the tile isn't in the sheet. */
export function topValues(items: SkuItem[], field: 'size' | 'finish' | 'body' | 'color', limit = 60): string[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    const v = i[field];
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([v]) => v);
}
