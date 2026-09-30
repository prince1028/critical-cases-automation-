import 'server-only';
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { caseEvents, caseTiles, criticalCases, tiles, users, type CaseStatus } from '@/db/schema';
import { formatCaseCode } from '@/lib/case-code';
import { PAGE_SIZE } from '@/lib/constants';
import type { CurrentUser } from '@/lib/dal';
import { canSeeAllCases } from '@/lib/dal';
import { allowedActions, canManageCases, STATUS_ACTIONS, type StatusAction } from '@/lib/permissions';
import type { NewCaseInput } from '@/lib/validation';
import { alias } from 'drizzle-orm/pg-core';

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const assignee = alias(users, 'assignee');


export interface CaseListItem {
  id: string;
  caseCode: string | null;
  tileCode: string | null;
  tileLabel: string | null;
  issueType: string;
  status: CaseStatus;
  source: string;
  createdAt: Date;
  reportedByName: string | null;
}

const listColumns = {
  id: criticalCases.id,
  caseCode: criticalCases.caseCode,
  tileCode: tiles.tileCode,
  tileLabel: sql<string | null>`coalesce(${tiles.name}, ${criticalCases.requestedTileName})`,
  issueType: criticalCases.issueType,
  status: criticalCases.status,
  source: criticalCases.source,
  createdAt: criticalCases.createdAt,
  reportedByName: sql<string | null>`coalesce(${users.name}, ${criticalCases.reportedByName})`,
};

export async function getMyCaseCounts(userId: string) {
  const rows = await db
    .select({ status: criticalCases.status, n: count() })
    .from(criticalCases)
    .where(eq(criticalCases.reportedBy, userId))
    .groupBy(criticalCases.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Partial<Record<CaseStatus, number>>;
  return { open: by.NEW ?? 0, inProgress: by.IN_PROGRESS ?? 0, resolved: by.RESOLVED ?? 0 };
}

export async function listRecentCases(userId: string, limit = 5): Promise<CaseListItem[]> {
  return db
    .select(listColumns)
    .from(criticalCases)
    .leftJoin(tiles, eq(tiles.id, criticalCases.tileId))
    .leftJoin(users, eq(users.id, criticalCases.reportedBy))
    .where(eq(criticalCases.reportedBy, userId))
    .orderBy(desc(criticalCases.createdAt))
    .limit(limit);
}

export interface ListCasesOptions {
  user: CurrentUser;
  scope: 'mine' | 'all';
  q?: string;
  status?: CaseStatus;
  page: number;
}

/** Server-side filtered, paginated case list. SALES users are always limited to their own cases. */
export async function listCases({ user, scope, q, status, page }: ListCasesOptions) {
  const effectiveScope = canSeeAllCases(user) ? scope : 'mine';
  const filters: SQL[] = [];
  if (effectiveScope === 'mine') filters.push(eq(criticalCases.reportedBy, user.id));
  if (status) filters.push(eq(criticalCases.status, status));
  if (q) {
    const p = `%${escapeLike(q)}%`;
    filters.push(
      or(
        ilike(criticalCases.caseCode, p),
        ilike(tiles.tileCode, p),
        ilike(tiles.name, p),
        ilike(criticalCases.requestedTileName, p),
        ilike(criticalCases.description, p),
        ilike(criticalCases.reportedByName, p),
      )!,
    );
  }
  const where = filters.length ? and(...filters) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select(listColumns)
      .from(criticalCases)
      .leftJoin(tiles, eq(tiles.id, criticalCases.tileId))
      .leftJoin(users, eq(users.id, criticalCases.reportedBy))
      .where(where)
      .orderBy(desc(criticalCases.createdAt), desc(criticalCases.caseCode))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: count() })
      .from(criticalCases)
      .leftJoin(tiles, eq(tiles.id, criticalCases.tileId))
      .where(where),
  ]);
  return { rows, total: Number(total), page, pageSize: PAGE_SIZE, scope: effectiveScope };
}

/** Full case for the detail page, or null if missing / not visible to this user. */
export async function getCaseForUser(id: string, user: CurrentUser) {
  const [c] = await db
    .select({
      case: criticalCases,
      tile: tiles,
      reporterName: users.name,
      reporterTeam: users.team,
      assigneeName: assignee.name,
    })
    .from(criticalCases)
    .leftJoin(tiles, eq(tiles.id, criticalCases.tileId))
    .leftJoin(users, eq(users.id, criticalCases.reportedBy))
    .leftJoin(assignee, eq(assignee.id, criticalCases.assignedTo))
    .where(eq(criticalCases.id, id))
    .limit(1);
  if (!c) return null;
  if (!canSeeAllCases(user) && c.case.reportedBy !== user.id) return null;

  const [linkedTiles, events] = await Promise.all([
    db
      .select({ id: tiles.id, tileCode: tiles.tileCode, name: tiles.name, role: caseTiles.role })
      .from(caseTiles)
      .innerJoin(tiles, eq(tiles.id, caseTiles.tileId))
      .where(eq(caseTiles.caseId, id))
      .orderBy(asc(caseTiles.position)),
    db
      .select({
        id: caseEvents.id,
        eventType: caseEvents.eventType,
        oldValue: caseEvents.oldValue,
        newValue: caseEvents.newValue,
        comment: caseEvents.comment,
        createdAt: caseEvents.createdAt,
        userName: users.name,
      })
      .from(caseEvents)
      .leftJoin(users, eq(users.id, caseEvents.userId))
      .where(eq(caseEvents.caseId, id))
      .orderBy(asc(caseEvents.createdAt)),
  ]);
  return { ...c, linkedTiles, events };
}

/**
 * Creates an app case for the signed-in employee. reported_by always comes from the session, never the form.
 * Case code, case row, tile link and CREATED event are written in one transaction.
 */
export async function createCase(user: CurrentUser, input: NewCaseInput) {
  return db.transaction(async (tx) => {
    if (input.tileId) {
      const [t] = await tx.select({ id: tiles.id }).from(tiles).where(eq(tiles.id, input.tileId)).limit(1);
      if (!t) throw new CaseInputError('tileId', 'That tile no longer exists. Search again.');
    }

    const { rows } = await tx.execute<{ n: string }>(sql`SELECT nextval('critical_case_code_seq') AS n`);
    const caseCode = formatCaseCode(Number(rows[0].n));
    const now = new Date();

    const [created] = await tx
      .insert(criticalCases)
      .values({
        caseCode,
        tileId: input.tileId,
        reportedBy: user.id,
        reportedByName: user.name,
        reportedOn: now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
        issueType: input.issueType,
        description: input.description,
        requestedTileName: input.requestedTileName,
        requestedColor: input.requestedColor,
        requestedSize: input.requestedSize,
        requestedFinish: input.requestedFinish,
        requiredQuantity: input.requiredQuantity?.toString() ?? null,
        availableQuantity: input.availableQuantity?.toString() ?? null,
        unit: input.unit,
        alternativeTileText: input.alternativeTileText,
        alternativeAccepted: input.alternativeAccepted,
        severity: input.severity,
        status: 'NEW',
        source: 'APP',
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: criticalCases.id, caseCode: criticalCases.caseCode });

    if (input.tileId) {
      await tx.insert(caseTiles).values({ caseId: created.id, tileId: input.tileId, role: 'REQUESTED', position: 0 });
    }
    await tx.insert(caseEvents).values({
      caseId: created.id,
      userId: user.id,
      eventType: 'CREATED',
      newValue: { status: 'NEW', case_code: caseCode },
      comment: input.notes,
      createdAt: now,
    });
    return created;
  });
}

export class CaseInputError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message);
  }
}

/** App cases waiting on the Supply team (dashboard counters for case handlers). */
export async function getSupplyQueueCounts() {
  const rows = await db
    .select({ status: criticalCases.status, n: count() })
    .from(criticalCases)
    .where(and(eq(criticalCases.source, 'APP'), or(eq(criticalCases.status, 'NEW'), eq(criticalCases.status, 'IN_PROGRESS'))))
    .groupBy(criticalCases.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Partial<Record<CaseStatus, number>>;
  return { waiting: by.NEW ?? 0, inProgress: by.IN_PROGRESS ?? 0 };
}

export class CaseActionError extends Error {}

/**
 * Status change by a case handler (Supply team / admin). Checked on the server: permission,
 * app-created case only (historical WhatsApp cases stay untouched), allowed transition, required note.
 * Records a STATUS_CHANGED event with the old and new values.
 */
export async function updateCaseStatus(user: CurrentUser, caseId: string, action: StatusAction, note: string | null) {
  if (!canManageCases(user)) throw new CaseActionError('Only the Supply team can change case status.');
  const def = STATUS_ACTIONS[action];
  if (def.noteRequired && !note) throw new CaseActionError(`Please add a note: ${def.noteLabel.toLowerCase()}`);

  return db.transaction(async (tx) => {
    const [c] = await tx
      .select({ id: criticalCases.id, status: criticalCases.status, source: criticalCases.source, resolution: criticalCases.resolution, assignedTo: criticalCases.assignedTo })
      .from(criticalCases)
      .where(eq(criticalCases.id, caseId))
      .for('update');
    if (!c) throw new CaseActionError('Case not found.');
    if (c.source !== 'APP') throw new CaseActionError('Historical WhatsApp cases are read-only.');
    if (!allowedActions(c.status).includes(action)) {
      throw new CaseActionError('This case was just updated by someone else. Refresh to see its current status.');
    }

    const now = new Date();
    const patch: Partial<typeof criticalCases.$inferInsert> = { status: def.to, updatedAt: now };
    if (action === 'RESOLVE') Object.assign(patch, { resolution: note, resolvedAt: now });
    if (action === 'REOPEN') Object.assign(patch, { resolution: null, resolvedAt: null });
    if (!c.assignedTo && (action === 'START' || action === 'RESOLVE')) patch.assignedTo = user.id;

    await tx.update(criticalCases).set(patch).where(eq(criticalCases.id, caseId));
    await tx.insert(caseEvents).values({
      caseId,
      userId: user.id,
      eventType: 'STATUS_CHANGED',
      oldValue: { status: c.status, resolution: c.resolution },
      newValue: { status: def.to, action, ...(action === 'RESOLVE' ? { resolution: note } : {}) },
      comment: note,
      createdAt: now,
    });
    return { status: def.to };
  });
}
