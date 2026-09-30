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
  DELIVERY_DELAY: 'Delivery Delay',
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

export const PAGE_SIZE = 20;
