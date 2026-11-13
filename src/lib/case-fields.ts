import type { IssueType } from '@/db/schema';

/** Optional detail fields the report form can show. Description is always shown. */
export type DetailField =
  | 'quantities'
  | 'requestedColor'
  | 'requestedSize'
  | 'requestedFinish'
  | 'alternative';

export interface IssueFieldConfig {
  /** Fields shown for this issue, in order. */
  show: DetailField[];
  /** Fields the salesperson must fill for this issue. */
  required: ('requiredQuantity' | 'availableQuantity' | 'unit' | 'requestedColor' | 'requestedSize' | 'requestedFinish')[];
  descriptionHint: string;
}

const STOCK: IssueFieldConfig = {
  show: ['quantities', 'alternative'],
  required: [],
  descriptionHint: 'What does the customer need, and by when?',
};

/**
 * Which fields matter for each issue. Keeps the form short: irrelevant fields are hidden,
 * and only the fields essential to act on the case are required.
 */
export const ISSUE_FIELDS: Record<IssueType, IssueFieldConfig> = {
  OUT_OF_STOCK: STOCK,
  INSUFFICIENT_STOCK: {
    show: ['quantities', 'alternative'],
    required: ['requiredQuantity', 'availableQuantity', 'unit'],
    descriptionHint: 'Customer need and deadline, e.g. "needs single batch within 10 days".',
  },
  COLOR_UNAVAILABLE: {
    show: ['requestedColor', 'quantities', 'alternative'],
    required: ['requestedColor'],
    descriptionHint: 'Which colour/shade the customer wants and what was offered.',
  },
  SIZE_UNAVAILABLE: {
    show: ['requestedSize', 'quantities', 'alternative'],
    required: ['requestedSize'],
    descriptionHint: 'Which size the customer wants.',
  },
  FINISH_UNAVAILABLE: {
    show: ['requestedFinish', 'quantities', 'alternative'],
    required: ['requestedFinish'],
    descriptionHint: 'Which finish the customer wants (matt, glossy, carving...).',
  },
  MATCHING_TILE_UNAVAILABLE: {
    show: ['quantities', 'alternative'],
    required: [],
    descriptionHint: 'Describe the tile the customer wants matched (where they saw it, look, size).',
  },
  QUALITY_ISSUE: {
    show: ['quantities'],
    required: [],
    descriptionHint: 'Describe the quality problem and how many pieces/boxes are affected.',
  },
  DAMAGED_TILE: {
    show: ['quantities'],
    required: [],
    descriptionHint: 'What is damaged, how many pieces/boxes, and where it happened (transit, site...).',
  },
  WRONG_TILE: {
    show: ['quantities'],
    required: [],
    descriptionHint: 'Which tile was delivered and which tile was ordered.',
  },
  WRONG_QUANTITY: {
    show: ['quantities'],
    required: [],
    descriptionHint: 'Ordered vs delivered quantity.',
  },
  LEAD_TIME: STOCK,
  PRICE_ISSUE: {
    show: ['quantities', 'alternative'],
    required: [],
    descriptionHint: 'Our price vs the price the customer has (and from where).',
  },
  ALTERNATIVE_REJECTED: {
    show: ['quantities', 'alternative'],
    required: [],
    descriptionHint: 'Why the customer rejected the alternative.',
  },
  OTHER: {
    show: ['quantities', 'alternative'],
    required: [],
    descriptionHint: 'Describe the problem.',
  },
};

const FIELD_ORDER: DetailField[] = ['requestedColor', 'requestedSize', 'requestedFinish', 'quantities', 'alternative'];

/** A case can have several problems: show and require everything any of them needs. Hint from the first. */
export function mergeIssueFields(issues: IssueType[]): IssueFieldConfig | null {
  if (!issues.length) return null;
  const cfgs = issues.map((i) => ISSUE_FIELDS[i]);
  const show = new Set(cfgs.flatMap((c) => c.show));
  return {
    show: FIELD_ORDER.filter((f) => show.has(f)),
    required: [...new Set(cfgs.flatMap((c) => c.required))],
    descriptionHint: cfgs[0].descriptionHint,
  };
}

/** Most problems a single case can carry. */
export const MAX_ISSUES = 5;
