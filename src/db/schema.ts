import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ---------- Enums ----------

export const userRole = pgEnum('user_role', ['SALES', 'MANAGER', 'ADMIN']);

export const ISSUE_TYPES = [
  'OUT_OF_STOCK',
  'INSUFFICIENT_STOCK',
  'COLOR_UNAVAILABLE',
  'SIZE_UNAVAILABLE',
  'FINISH_UNAVAILABLE',
  'MATCHING_TILE_UNAVAILABLE',
  'QUALITY_ISSUE',
  'DAMAGED_TILE',
  'WRONG_TILE',
  'WRONG_QUANTITY',
  'DELIVERY_DELAY',
  'PRICE_ISSUE',
  'ALTERNATIVE_REJECTED',
  'OTHER',
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];
export const issueType = pgEnum('issue_type', ISSUE_TYPES);

export const CASE_STATUSES = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const caseStatus = pgEnum('case_status', CASE_STATUSES);

export const caseSeverity = pgEnum('case_severity', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const caseSource = pgEnum('case_source', ['WHATSAPP_HISTORICAL', 'APP']);
export const extractionConfidence = pgEnum('extraction_confidence', ['HIGH', 'MEDIUM', 'LOW']);

/** What kind of identifier tiles.tile_code holds. Florzy IDs and vendor SKUs share the column. */
export const tileCodeType = pgEnum('tile_code_type', ['FLORZY_ID', 'VENDOR_CODE', 'UNKNOWN']);

/** How a tile relates to a case when a case involves several tiles. */
export const caseTileRole = pgEnum('case_tile_role', ['REQUESTED', 'QUOTED', 'ALTERNATIVE']);

export const caseEventType = pgEnum('case_event_type', [
  'HISTORICAL_IMPORT',
  'CREATED',
  'UPDATED',
  'STATUS_CHANGED',
  'ASSIGNED',
  'COMMENT',
]);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

// ---------- Users (application-level; auth via Supabase later) ----------

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authUserId: uuid('auth_user_id').unique(),
    name: varchar('name', { length: 200 }).notNull(),
    email: varchar('email', { length: 320 }).unique(),
    /** Team the employee belongs to (set by an admin). A team containing "supply" can resolve/close cases. */
    team: varchar('team', { length: 100 }),
    /** Login name, stored lowercase. NULL until an admin gives the person a login. */
    username: varchar('username', { length: 50 }).unique(),
    /** scrypt hash (see src/lib/password.ts). Never a plain-text password. */
    passwordHash: text('password_hash'),
    /** Set when an admin creates the account or resets the password; forces a change at next login. */
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    /** Bumped on password change/reset/deactivation to sign out existing sessions. */
    sessionVersion: integer('session_version').notNull().default(1),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    role: userRole('role').notNull().default('SALES'),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (t) => [index('users_role_idx').on(t.role)],
);

// ---------- Tiles (tile master) ----------

export const tiles = pgTable(
  'tiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Business identifier (text, never numeric: keeps leading zeroes and alphanumeric codes). Canonical form, see normalizeTileNumber. */
    tileCode: varchar('tile_code', { length: 100 }).notNull().unique(),
    codeType: tileCodeType('code_type').notNull().default('UNKNOWN'),
    name: varchar('name', { length: 300 }),
    brand: varchar('brand', { length: 150 }),
    supplier: varchar('supplier', { length: 150 }),
    /** Vendor's own code when tile_code is a Florzy ID (e.g. 6716 -> NS 9675 HL 4). */
    supplierCode: varchar('supplier_code', { length: 100 }),
    color: varchar('color', { length: 150 }),
    size: varchar('size', { length: 100 }),
    finish: varchar('finish', { length: 150 }),
    currentStock: numeric('current_stock', { precision: 12, scale: 2 }),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  // tile_code is already indexed by its UNIQUE constraint.
  (t) => [index('tiles_name_idx').on(t.name)],
);

// ---------- Critical cases ----------

/**
 * Numbers for app-created case codes (CC-115, CC-116, ...), continuing the historical CC-001..CC-114 series.
 * The migration moves it past the highest existing CC-number so codes never collide.
 */
export const caseCodeSeq = pgSequence('critical_case_code_seq', { startWith: 115 });

export const criticalCases = pgTable(
  'critical_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Human-readable case label from the historical sheet (e.g. CC-001). Not an identity key. */
    caseCode: varchar('case_code', { length: 20 }),

    /** Primary tile of the case; all linked tiles are in case_tiles. */
    tileId: uuid('tile_id').references(() => tiles.id, { onDelete: 'set null' }),

    reportedBy: uuid('reported_by').references(() => users.id, { onDelete: 'set null' }),
    /** Employee name as written in the source, kept until users exist. */
    reportedByName: varchar('reported_by_name', { length: 200 }),
    reportedOn: date('reported_on'),

    issueType: issueType('issue_type').notNull(),
    /** Further issue types when a case has several (first one is issue_type). */
    secondaryIssueTypes: issueType('secondary_issue_types').array(),
    /** Issue value exactly as it appeared in the source. */
    originalIssueType: text('original_issue_type'),
    description: text('description'),

    /** Tile details as described in the case, when no tile master record could be linked or for extra context. */
    requestedTileName: text('requested_tile_name'),
    requestedTileNo: text('requested_tile_no'),
    requestedColor: text('requested_color'),
    requestedSize: text('requested_size'),
    requestedFinish: text('requested_finish'),
    /** Competitor / retailer codes mentioned (MyTyles, Material Depot, Trove...). Not our tiles. */
    competitorReferences: text('competitor_references').array(),

    requiredQuantity: numeric('required_quantity', { precision: 12, scale: 2 }),
    requiredQuantityText: text('required_quantity_text'),
    availableQuantity: numeric('available_quantity', { precision: 12, scale: 2 }),
    availableQuantityText: text('available_quantity_text'),
    unit: varchar('unit', { length: 40 }),

    alternativeTileId: uuid('alternative_tile_id').references(() => tiles.id, { onDelete: 'set null' }),
    alternativeTileText: text('alternative_tile_text'),
    alternativeAccepted: boolean('alternative_accepted'),
    alternativeAcceptedText: text('alternative_accepted_text'),

    severity: caseSeverity('severity'),
    status: caseStatus('status').notNull().default('NEW'),
    originalStatus: varchar('original_status', { length: 60 }),

    assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),

    resolution: text('resolution'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),

    source: caseSource('source').notNull().default('APP'),
    sourceMessages: text('source_messages'),
    imageEvidence: text('image_evidence'),
    reviewerNotes: text('reviewer_notes'),
    extractionConfidence: extractionConfidence('extraction_confidence'),

    needsReview: boolean('needs_review').notNull().default(false),
    reviewReasons: text('review_reasons').array(),

    importHash: varchar('import_hash', { length: 64 }).unique(),
    importedAt: timestamp('imported_at', { withTimezone: true }),

    ...timestamps,
  },
  (t) => [
    index('critical_cases_tile_id_idx').on(t.tileId),
    index('critical_cases_status_idx').on(t.status),
    index('critical_cases_issue_type_idx').on(t.issueType),
    index('critical_cases_created_at_idx').on(t.createdAt),
    index('critical_cases_reported_by_idx').on(t.reportedBy),
    index('critical_cases_assigned_to_idx').on(t.assignedTo),
    index('critical_cases_needs_review_idx').on(t.needsReview),
    index('critical_cases_alternative_tile_id_idx').on(t.alternativeTileId),
    index('critical_cases_case_code_idx').on(t.caseCode),
  ],
);

/** All tiles involved in a case (a case can name several, e.g. "724; 3015"). */
export const caseTiles = pgTable(
  'case_tiles',
  {
    caseId: uuid('case_id')
      .notNull()
      .references(() => criticalCases.id, { onDelete: 'cascade' }),
    tileId: uuid('tile_id')
      .notNull()
      .references(() => tiles.id, { onDelete: 'restrict' }),
    role: caseTileRole('role').notNull().default('REQUESTED'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.caseId, t.tileId] }), index('case_tiles_tile_id_idx').on(t.tileId)],
);

// ---------- Case events (audit trail) ----------

export const caseEvents = pgTable(
  'case_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => criticalCases.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    eventType: caseEventType('event_type').notNull(),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('case_events_case_id_idx').on(t.caseId),
    index('case_events_created_at_idx').on(t.createdAt),
    index('case_events_event_type_idx').on(t.eventType),
  ],
);
