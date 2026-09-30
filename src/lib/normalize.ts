import { CASE_STATUSES, ISSUE_TYPES, type CaseStatus, type IssueType } from '../db/schema';

const EMPTY = new Set(['', 'UNKNOWN', 'N/A', 'NA', 'NONE', '-', 'NULL']);

// Anything that looks like a quantity, dimension, price or unit is never a tile number.
const UNIT_PATTERN =
  /\b(SQ\.?\s?FT|SQFT|SFT|SQM|BOX(ES)?|PCS?|PIECES?|MM|CM|FT|FEET|INCH(ES)?|KG|TONS?|RS|INR|DAYS?|SLABS?)\b|[₹%]|\d\s*[X×*]\s*\d/;

export interface NormalizeTileOptions {
  /**
   * Accept a value made only of digits (e.g. "7594"). Only pass true when the value
   * comes from a field that is known to hold tile identifiers, never from free text.
   */
  allowBareNumber?: boolean;
}

/**
 * Canonical form for a tile identifier, or null when the value is not confidently one.
 *
 *   "T-234", "T234", "t-234", "T 234"  -> "T-234"
 *   "#SA1268"                           -> "SA-1268"
 *   "TL 10711 B" / "TL-10711-B"         -> "TL-10711-B"
 *   "Omega 7008"                        -> "OMEGA-7008"
 *   "7594" (allowBareNumber)            -> "7594"
 *   "120 sqft", "600x600", "Rs 90", "7594" (without allowBareNumber) -> null
 */
export function normalizeTileNumber(raw: unknown, opts: NormalizeTileOptions = {}): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim().toUpperCase();
  if (EMPTY.has(s)) return null;
  if (UNIT_PATTERN.test(s)) return null;

  s = s.replace(/^#/, '');
  const tokens = s.split(/[\s\-_]+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 6) return null;
  if (!tokens.every((t) => /^[A-Z0-9]+$/.test(t))) return null;
  if (!/\d/.test(s)) return null; // a tile number must contain a digit

  if (tokens.length === 1) {
    const [t] = tokens;
    if (/^\d+$/.test(t)) {
      if (!opts.allowBareNumber || t.length < 3) return null;
      return t;
    }
    const m = /^([A-Z]+)(\d+)$/.exec(t);
    if (m) return `${m[1]}-${m[2]}`;
    return t;
  }
  return tokens.join('-');
}

// ---------- Issue types ----------

const ISSUE_SYNONYMS: Record<string, IssueType> = {
  'NO STOCK': 'OUT_OF_STOCK',
  'STOCK OUT': 'OUT_OF_STOCK',
  'OUT OF STOCK': 'OUT_OF_STOCK',
  'INSUFFICIENT QUANTITY': 'INSUFFICIENT_STOCK',
  'LOW STOCK': 'INSUFFICIENT_STOCK',
  DAMAGED: 'DAMAGED_TILE',
  'DAMAGE': 'DAMAGED_TILE',
  'DELAY': 'DELIVERY_DELAY',
  'LEAD TIME': 'DELIVERY_DELAY',
  PRICE: 'PRICE_ISSUE',
  PRICING: 'PRICE_ISSUE',
  QUALITY: 'QUALITY_ISSUE',
};

export interface NormalizedIssues {
  primary: IssueType;
  secondary: IssueType[];
  /** Source values that did not map and were recorded as OTHER. */
  unmapped: string[];
}

/** Splits "OUT_OF_STOCK, DELIVERY_DELAY" into canonical issue types. First one is primary. */
export function normalizeIssueTypes(raw: unknown): NormalizedIssues {
  const parts = String(raw ?? '')
    .split(/[,;+/]| and /i)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: IssueType[] = [];
  const unmapped: string[] = [];
  for (const p of parts) {
    const key = p.toUpperCase().replace(/[\s-]+/g, '_');
    const spaced = p.toUpperCase().replace(/[_-]+/g, ' ').trim();
    const mapped =
      (ISSUE_TYPES as readonly string[]).includes(key) ? (key as IssueType) : ISSUE_SYNONYMS[spaced];
    if (mapped) {
      if (!out.includes(mapped)) out.push(mapped);
    } else {
      unmapped.push(p);
      if (!out.includes('OTHER')) out.push('OTHER');
    }
  }
  if (out.length === 0) {
    return { primary: 'OTHER', secondary: [], unmapped: raw ? [String(raw)] : [] };
  }
  return { primary: out[0], secondary: out.slice(1), unmapped };
}

// ---------- Status ----------

export interface NormalizedStatus {
  status: CaseStatus;
  reviewReason?: string;
}

/**
 * Historical sheet statuses -> NEW / IN_PROGRESS / RESOLVED / CANCELLED.
 * "Unresolved" and "Unknown" have no exact equivalent; they become NEW and are flagged for review
 * rather than guessed as RESOLVED or CANCELLED.
 */
export function normalizeStatus(raw: unknown): NormalizedStatus {
  const s = String(raw ?? '').trim().toLowerCase();
  const upper = s.toUpperCase().replace(/[\s-]+/g, '_');
  if ((CASE_STATUSES as readonly string[]).includes(upper)) return { status: upper as CaseStatus };
  switch (s) {
    case 'resolved':
    case 'closed':
    case 'done':
      return { status: 'RESOLVED' };
    case 'resolution offered':
    case 'in progress':
    case 'in-progress':
      return { status: 'IN_PROGRESS' };
    case 'open':
    case 'new':
      return { status: 'NEW' };
    case 'cancelled':
    case 'canceled':
      return { status: 'CANCELLED' };
    case 'unresolved':
      return { status: 'NEW', reviewReason: 'STATUS_UNRESOLVED' };
    case '':
    case 'unknown':
      return { status: 'NEW', reviewReason: 'STATUS_UNKNOWN' };
    default:
      return { status: 'NEW', reviewReason: 'STATUS_UNMAPPED' };
  }
}

// ---------- Quantities, units, dates, booleans ----------

/**
 * A number only when the cell states one quantity: "1000", "25,000", "0 (no stock pan-India)".
 * Ranges, lists and mixed text ("250-300", "110; 442", "30 boxes / 270 sqft") give null; the raw text is kept separately.
 */
export function parseQuantity(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (EMPTY.has(s.toUpperCase())) return null;
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:\s*\(([^()]*)\))?$/.exec(s);
  if (!m) return null;
  return Number(`${m[1].replace(/,/g, '')}${m[2] ? `.${m[2]}` : ''}`);
}

const UNITS: Record<string, string> = {
  box: 'boxes', boxes: 'boxes', sqft: 'sqft', 'sq ft': 'sqft', sft: 'sqft', pcs: 'pcs', pc: 'pcs',
  pieces: 'pcs', set: 'set', sets: 'set', slab: 'slabs', slabs: 'slabs', ft: 'ft',
};

/** Single recognised unit, or null. Mixed units ("boxes / sqft") return null; raw text stays in the *_text columns. */
export function normalizeUnit(raw: unknown): string | null {
  const s = String(raw ?? '').trim().toLowerCase();
  return UNITS[s] ?? null;
}

/** Sheet dates are dd/mm/yy (WhatsApp export, 2026). Returns ISO yyyy-mm-dd or null if invalid. */
export function parseSheetDate(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(String(raw ?? '').trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

/** "Yes (deal on)" -> true, "No (...)" -> false, "Unknown"/"N/A"/"Unclear ..." -> null. */
export function parseYesNo(raw: unknown): boolean | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (/^yes\b/.test(s)) return true;
  if (/^no\b/.test(s)) return false;
  return null;
}

/** Empty / placeholder values become null so they are not stored as literal "Unknown". */
export function clean(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return EMPTY.has(s.toUpperCase()) ? null : s;
}
