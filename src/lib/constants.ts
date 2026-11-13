import type { CaseStatus, IssueType } from '@/db/schema';

export const ISSUE_LABELS: Record<IssueType, string> = {
  OUT_OF_STOCK: 'Out of Stock',
  INSUFFICIENT_STOCK: 'Insufficient Stock',
  COLOR_UNAVAILABLE: 'Color Unavailable',
  SIZE_UNAVAILABLE: 'Size Unavailable',
  FINISH_UNAVAILABLE: 'Finish Unavailable',
  MATCHING_TILE_UNAVAILABLE: 'Matching Tile Unavailable',
  QUALITY_ISSUE: 'Quality Issue',
  DAMAGED_TILE: 'Damaged Tile',
  WRONG_TILE: 'Wrong Tile',
  WRONG_QUANTITY: 'Wrong Quantity',
  LEAD_TIME: 'Lead Time',
  PRICE_ISSUE: 'Price Issue',
  ALTERNATIVE_REJECTED: 'Alternative Rejected',
  OTHER: 'Other',
};

export const STATUS_LABELS: Record<CaseStatus, string> = {
  NEW: 'New',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CANCELLED: 'Cancelled',
};

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_LABELS: Record<Severity, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

/** Same unit vocabulary the historical import normalised to. */
export const UNITS = ['boxes', 'sqft', 'pcs', 'set', 'slabs'] as const;
export type Unit = (typeof UNITS)[number];

export const ROLE_LABELS = { SALES: 'Sales', MANAGER: 'Manager', ADMIN: 'Admin' } as const;

/**
 * Why a case is flagged `needs_review`. The codes are written by the historical import
 * (scripts/import-critical-cases.ts) and the WhatsApp TXT import (src/lib/whatsapp.ts) and
 * stored in critical_cases.review_reasons; unknown codes fall back to their raw text.
 */
export const REVIEW_REASON_LABELS: Record<string, string> = {
  NO_TILE_NUMBER: 'Missing tile code',
  COMPETITOR_CODE_ONLY: 'Only a competitor code',
  TILE_REFERENCE_UNPARSED: 'Unclear tile reference',
  ISSUE_TYPE_UNMAPPED: 'Unrecognised issue type',
  STATUS_UNRESOLVED: 'Status was “Unresolved”',
  STATUS_UNKNOWN: 'Status unknown',
  STATUS_UNMAPPED: 'Unrecognised status',
  LOW_EXTRACTION_CONFIDENCE: 'Low extraction confidence',
  DATA_CONFLICT: 'Conflicting source data',
  AMBIGUOUS_ISSUE: 'Ambiguous issue',
  NO_ISSUE_TYPE: 'No issue type found',
  SENDER_UNKNOWN: 'Unknown reporter',
};

export const reviewReasonLabel = (reason: string) => REVIEW_REASON_LABELS[reason] ?? reason.replace(/_/g, ' ').toLowerCase();

export const PAGE_SIZE = 20;

/** Case Explorer rows per page; smaller than the operational list so the drawer stays readable. */
export const EXPLORER_PAGE_SIZE = 20;
