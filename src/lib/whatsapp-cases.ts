/**
 * Turns one WhatsApp message into the fields of a critical case.
 *
 * Everything here reuses the normalisers the historical spreadsheet import already uses
 * (src/lib/normalize.ts and src/import/tile-references.ts) so a chat message and a spreadsheet row
 * are read the same way. Nothing is invented: a field the message does not state stays null, and the
 * case is flagged for review instead of being guessed.
 */

import type { CaseStatus, IssueType } from '@/db/schema';
import { parseTileReferences, type TileRef } from '@/import/tile-references';
import { findIssueTypesInText, normalizeStatus, normalizeUnit, parseQuantity } from '@/lib/normalize';
import type { ReviewReason } from '@/lib/review-reasons';
import { messageFingerprint, type WaMessage } from '@/lib/whatsapp';

/** "Alice <+919876543210>" / "+91 98765 43210" -> "Alice" / null when the sender is only a number. */
export function senderName(raw: string): string | null {
  const s = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (/^[+\d][\d\s()+-]{5,}$/.test(s)) return null; // a phone number, not a person
  return s.length >= 2 && s.length <= 200 ? s : null;
}

/**
 * A reference to a tile inside free text: a Florzy ID on its own ("1049"), or a supplier code with
 * a short prefix and an optional qualifier ("T-234", "CFDC1515023", "NS 9675 HL 4").
 *
 * A space-separated prefix only counts when it is written in capitals, because lowercase letters in
 * front of a number are almost always an ordinary word ("out of stock for 1049"). The digits are
 * still read as a Florzy ID in that case, and the unclear form is reported in `unparsed`.
 */
const REFERENCE = /\b(?:[A-Z]{1,4}[-\s]?)?\d{3,8}(?:[-\s][A-Z]{1,3})?(?:[-\s]\d{1,2})?\b/g;
/** What follows a reference when the number is really a quantity or a price. */
const UNIT_AFTER = /^\s*(sq\.?\s?ft|sqft|sft|sqm|box(es)?|pcs?|pieces?|sets?|slabs?|nos?|ft|mm|cm|kg|tons?|rs\.?|inr|days?|%|x)\b/i;
/** What precedes a reference when the number is really a quantity. */
const QTY_BEFORE = /(?:need|needed|require|required|requirement|have|available|stock|only|left|qty|quantity|order|of)\s*[:=]?\s*$/i;
/** Retailer codes that are not our tiles. */
const COMPETITOR_NEAR = /\b(mytyles|mytiles|material\s+depot|trove|krupa|competitor|reference\s+label)\b/i;

export interface ExtractedTiles {
  tiles: TileRef[];
  competitor: string[];
  unparsed: string[];
}

/**
 * Finds the tile references in a message. A bare number is only read as a tile when it is not a
 * quantity ("need 1000 sqft") and not part of a competitor's code; anything unclear is reported in
 * `unparsed` so the case can be flagged for review rather than guessed.
 */
export function extractTiles(text: string): ExtractedTiles {
  const flat = text.replace(/\s+/g, ' ');
  const out: ExtractedTiles = { tiles: [], competitor: [], unparsed: [] };

  for (const m of flat.matchAll(REFERENCE)) {
    const raw = m[0].trim();
    if (!/\d{3}/.test(raw)) continue; // has to carry a real code, not "5" or "42"

    const after = flat.slice(m.index + m[0].length, m.index + m[0].length + 12);
    const before = flat.slice(Math.max(0, m.index - 16), m.index);
    const window = `${before} ${raw} ${after}`;

    if (COMPETITOR_NEAR.test(window)) {
      if (!out.competitor.includes(raw)) out.competitor.push(raw);
      continue;
    }
    // "need 1000 sqft": the number is a quantity, not a tile.
    if (UNIT_AFTER.test(after) || QTY_BEFORE.test(before)) continue;

    const parsed = parseTileReferences(raw);
    for (const t of parsed.tiles) {
      if (!out.tiles.some((x) => x.tileCode === t.tileCode)) out.tiles.push(t);
    }
    for (const c of parsed.competitor) if (!out.competitor.includes(c)) out.competitor.push(c);
    for (const u of parsed.unparsed) if (!out.unparsed.includes(u)) out.unparsed.push(u);
  }
  return out;
}

/**
 * Issue types named in the message. Chat prose is matched against the vocabulary as phrases; the
 * sheet import's cell parser is not used here because a message is not a cell.
 */
export function extractIssues(text: string) {
  return findIssueTypesInText(text);
}

/** The status words people actually write in chat, mapped through the same table as the sheet. */
const STATUS_WORDS: [RegExp, string][] = [
  [/\b(no longer needed|not required anymore|cancelled|canceled|drop(?:ped)?\s+the\s+case)\b/i, 'CANCELLED'],
  [/\b(resolved|fixed|dispatched|delivered|supplied|arrived)\b/i, 'RESOLVED'],
  [/\b(in progress|processing|on the way|under process)\b/i, 'IN_PROGRESS'],
  [/\b(unresolved|still pending|no update)\b/i, 'UNRESOLVED'],
  [/\b(open)\b/i, 'OPEN'],
];

/** The status named in the message, or NEW with a review flag when it was not readable. */
export function extractStatus(text: string): { status: CaseStatus; reviewReason?: ReviewReason } {
  for (const [re, word] of STATUS_WORDS) if (re.test(text)) {
    const n = normalizeStatus(word);
    // normalizeStatus only ever returns the review reasons listed in review-reasons.ts.
    return { status: n.status as CaseStatus, reviewReason: n.reviewReason as ReviewReason | undefined };
  }
  // No status word at all: NEW, flagged so a reviewer can set the real one.
  return { status: 'NEW' as CaseStatus, reviewReason: 'STATUS_UNKNOWN' as ReviewReason };
}

/**
 * "need 1000 sqft", "have 0", "only 25 boxes" -> the first required/available quantity found.
 * "stock" is deliberately not a trigger: it sits too far from the number ("in stock, need 40") and
 * would swallow the requirement.
 */
const QTY = /\b(need|needed|require|required|requirement|have|available|only|left)\b[^.\n]{0,16}?(\d[\d,.]*)\s*(sq\.?\s?ft|sqft|sft|sqm|boxes?|pcs?|pieces?|sets?|slabs?)?\b/gi;

export function extractQuantities(text: string) {
  let required: { value: string | null; text: string | null } = { value: null, text: null };
  let available: { value: string | null; text: string | null } = { value: null, text: null };
  let unit: string | null = null;
  for (const m of text.matchAll(QTY)) {
    const parsed = parseQuantity(m[2]);
    const value = parsed === null ? null : parsed.toString();
    if (m[3]) unit = unit ?? normalizeUnit(m[3]);
    if (/^(have|available|only|left)$/i.test(m[1])) {
      if (!available.text) available = { value, text: m[2] };
    } else if (!required.text) {
      required = { value, text: m[2] };
    }
  }
  return { required, available, unit };
}

const ALTERNATIVE = /\b(alternative[^.\n]{0,80}|instead[^.\n]{0,60}|we can offer[^.\n]{0,60})/i;
const ALT_ACCEPT = /\b(accepted|approved|rejected|not accepted|not approved)\b/i;

/** Explicit "alternative accepted / rejected" wording only; otherwise null (never guessed). */
export function extractAlternative(text: string) {
  const hit = ALT_ACCEPT.exec(text)?.[1]?.toLowerCase();
  if (!hit) return { text: ALTERNATIVE.exec(text)?.[0]?.trim() ?? null, accepted: null as boolean | null };
  return {
    text: ALTERNATIVE.exec(text)?.[0]?.trim() ?? hit,
    accepted: hit === 'rejected' || hit === 'not accepted' || hit === 'not approved' ? false : true,
  };
}

export interface ExtractedCase {
  /** Deterministic identity: message date + time + sender + text. Never a row number or an upload time. */
  fingerprint: string;
  reportedOn: string;
  reportedByName: string | null;
  issueType: IssueType;
  secondaryIssueTypes: IssueType[] | null;
  /** The message as the case description: what was reported, before anything was read out of it. */
  description: string;
  tileCodes: string[];
  competitorReferences: string[] | null;
  requestedTileNo: string;
  requiredQuantity: string | null;
  requiredQuantityText: string | null;
  availableQuantity: string | null;
  availableQuantityText: string | null;
  unit: string | null;
  alternativeTileText: string | null;
  alternativeAccepted: boolean | null;
  status: CaseStatus;
  needsReview: boolean;
  reviewReasons: ReviewReason[];
  /** The exact message, also kept in source_messages so every number can be traced back. */
  sourceMessage: string;
  sender: string;
}

/**
 * Builds the case for one message that `classifyMessages` marked as a critical case.
 * The result is always flagged for review when anything could not be read confidently.
 */
export function extractCase(message: WaMessage, opts: { knownReporters?: readonly string[] } = {}): ExtractedCase | null {
  const text = message.text.trim();
  if (!text) return null;

  const tiles = extractTiles(text);
  const issues = extractIssues(text);
  const status = extractStatus(text);
  const qty = extractQuantities(text);
  const alternative = extractAlternative(text);
  const sender = senderName(message.sender);

  const reasons: ReviewReason[] = [];
  if (tiles.tiles.length === 0) {
    if (tiles.competitor.length) reasons.push('COMPETITOR_CODE_ONLY');
    else reasons.push('NO_TILE_NUMBER');
  }
  if (tiles.unparsed.length) reasons.push('TILE_REFERENCE_UNPARSED');
  if (issues.unmapped.length) reasons.push('ISSUE_TYPE_UNMAPPED');
  if (issues.secondary.length > 1) reasons.push('AMBIGUOUS_ISSUE');
  if (status.reviewReason) reasons.push(status.reviewReason);
  if (!sender || (opts.knownReporters?.length && !opts.knownReporters.includes(sender))) {
    reasons.push('SENDER_UNKNOWN');
  }

  return {
    fingerprint: messageFingerprint(message),
    reportedOn: message.reportedOn,
    reportedByName: sender,
    issueType: issues.primary,
    secondaryIssueTypes: issues.secondary.length ? issues.secondary : null,
    description: text,
    tileCodes: tiles.tiles.map((t) => t.tileCode),
    competitorReferences: tiles.competitor.length ? tiles.competitor : null,
    requestedTileNo: tiles.tiles.map((t) => t.tileCode).join('; '),
    requiredQuantity: qty.required.value,
    requiredQuantityText: qty.required.text,
    availableQuantity: qty.available.value,
    availableQuantityText: qty.available.text,
    unit: qty.unit,
    alternativeTileText: alternative.text,
    alternativeAccepted: alternative.accepted,
    status: status.status,
    needsReview: reasons.length > 0,
    reviewReasons: reasons,
    sourceMessage: text,
    sender: message.sender,
  };
}