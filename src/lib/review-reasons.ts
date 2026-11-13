/**
 * Why a case is flagged `needs_review`.
 *
 * These codes are the shared vocabulary of both ingestion channels: the historical spreadsheet
 * import (scripts/import-critical-cases.ts) and the WhatsApp TXT import (src/lib/whatsapp-cases.ts).
 * They are stored in critical_cases.review_reasons and aggregated on the analytics page.
 * Labels live in src/lib/constants.ts.
 */
export const REVIEW_REASONS = [
  /** No tile code could be read from the source at all. */
  'NO_TILE_NUMBER',
  /** Only a competitor/retailer code was mentioned, so there is no Florzy tile to count. */
  'COMPETITOR_CODE_ONLY',
  /** Part of a tile reference could not be read confidently. */
  'TILE_REFERENCE_UNPARSED',
  /** The issue type written in the source is not in the taxonomy. */
  'ISSUE_TYPE_UNMAPPED',
  /** The source said "Unresolved", which has no exact status. */
  'STATUS_UNRESOLVED',
  /** No status at all in the source. */
  'STATUS_UNKNOWN',
  /** A status word that is not in the taxonomy. */
  'STATUS_UNMAPPED',
  /** The extraction was done with low confidence. */
  'LOW_EXTRACTION_CONFIDENCE',
  /** Two parts of the source disagree. */
  'DATA_CONFLICT',
  /** Several issue types were named and no primary one is clear. */
  'AMBIGUOUS_ISSUE',
  /** A case-looking message with no recognisable issue type. */
  'NO_ISSUE_TYPE',
  /** The sender could not be resolved to a known person. */
  'SENDER_UNKNOWN',
] as const;

export type ReviewReason = (typeof REVIEW_REASONS)[number];

export const isReviewReason = (v: string): v is ReviewReason => (REVIEW_REASONS as readonly string[]).includes(v);