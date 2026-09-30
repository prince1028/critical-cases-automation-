import { normalizeTileNumber } from '../lib/normalize';

export type CodeType = 'FLORZY_ID' | 'VENDOR_CODE' | 'UNKNOWN';
export type TileRole = 'REQUESTED' | 'QUOTED';

export interface TileRef {
  tileCode: string; // canonical
  codeType: CodeType;
  role: TileRole;
  supplierCode?: string;
  brand?: string;
  raw: string;
}

export interface ParsedTileReferences {
  tiles: TileRef[];
  /** Retailer/competitor codes (MyTyles, Material Depot, Trove, Krupa...) and unqualified references. Never tiles. */
  competitor: string[];
  /** Parts that could not be read confidently. */
  unparsed: string[];
}

// Codes that belong to competitor retailers, not to our catalogue.
const COMPETITOR_WORDS = /\b(MyTyles|MyTiles|Material Depot|Trove|Krupa|competitor|reference label|MD ref)\b/i;
// Material Depot listings use "TL 0xxxx"; MyTyles display labels use "STP nn".
const COMPETITOR_CODE_PATTERNS = [/^TL[\s-]?\d{4,}/i, /^STP[\s-]?\d+$/i];

/**
 * Parses the historical sheet's "Tile No" cell, e.g.
 *   "724; 3015"                                   -> two tiles
 *   "7269; 7270 (Florzy IDs)"                     -> two Florzy IDs
 *   "NS 9675 HL 4 (Florzy ID 6716)"               -> tile 6716, supplier code NS 9675 HL 4
 *   "CFDC1515023 (9879); ...; 3114"               -> Florzy IDs with vendor codes
 *   "6247 (Florzy ID); competitor Krupa 2112"     -> tile 6247 + competitor ref
 *   "MyTyles 16641 (competitor ref)"              -> competitor only
 *   "1516 (our quoted tile)"                      -> tile 1516, role QUOTED
 */
export function parseTileReferences(raw: string | null): ParsedTileReferences {
  const out: ParsedTileReferences = { tiles: [], competitor: [], unparsed: [] };
  if (!raw) return out;

  const add = (code: string, codeType: CodeType, extra: Partial<TileRef> = {}) => {
    const tileCode = normalizeTileNumber(code, { allowBareNumber: true });
    if (!tileCode) {
      out.unparsed.push(code);
      return;
    }
    if (out.tiles.some((t) => t.tileCode === tileCode)) return;
    out.tiles.push({ tileCode, codeType, role: 'REQUESTED', raw: code, ...extra });
  };

  for (const part of raw.split(/;|\s\+\s/).map((p) => p.trim()).filter(Boolean)) {
    let m: RegExpExecArray | null;

    if (/^Florzy:\s*/i.test(part)) {
      add(part.replace(/^Florzy:\s*/i, ''), 'UNKNOWN');
      continue;
    }
    if (COMPETITOR_WORDS.test(part) || COMPETITOR_CODE_PATTERNS.some((re) => re.test(part))) {
      out.competitor.push(part);
      continue;
    }
    if ((m = /^(.+?)\s*\(Florzy IDs?\s*(\d+)?\)$/i.exec(part))) {
      if (m[2]) add(m[2], 'FLORZY_ID', { supplierCode: m[1] });
      else add(m[1], 'FLORZY_ID');
      continue;
    }
    if ((m = /^(.+?)\s*\((\d{3,6})\)$/.exec(part))) {
      add(m[2], 'FLORZY_ID', { supplierCode: m[1] });
      continue;
    }
    if ((m = /^(.+?)\s*\(our quoted tile\)$/i.exec(part))) {
      add(m[1], 'UNKNOWN', { role: 'QUOTED' });
      continue;
    }
    if ((m = /^(\d+)\s*\((.+)\)$/.exec(part))) {
      // Bare number qualified by another brand (e.g. "1001 (Monolith design no.)"): it is that brand's
      // design number, which could collide with our own numeric IDs, so keep it as a reference only.
      out.competitor.push(part);
      continue;
    }
    if ((m = /^(.+?)\s*\(([^()]+)\)$/.exec(part))) {
      add(m[1], 'VENDOR_CODE', { brand: m[2] });
      continue;
    }
    add(part, 'UNKNOWN');
  }
  return out;
}
