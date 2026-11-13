import 'server-only';
import { and, asc, count, desc, eq, ilike, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { caseAttachments, caseEvents, caseTiles, criticalCases, tiles, users, type CaseStatus } from '@/db/schema';
import { formatCaseCode } from '@/lib/case-code';
import { PAGE_SIZE } from '@/lib/constants';
import type { CurrentUser } from '@/lib/dal';
import { canSeeAllCases } from '@/lib/dal';
import { awaitingListing, canAddPhotos, canManageCases, canMarkListed, canPostMessages, STATUS_ACTIONS, statusActionsFor, type StatusAction } from '@/lib/permissions';
import { MAX_CASE_PHOTOS } from '@/lib/photos';
import type { SkuItem } from '@/lib/sku-sheet';
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
  secondaryIssueTypes: string[] | null;
  status: CaseStatus;
  source: string;
  createdAt: Date;
  reportedByName: string | null;
}

const listColumns = {
  id: criticalCases.id,
  caseCode: criticalCases.caseCode,
  tileCode: sql<string | null>`coalesce(${tiles.tileCode}, ${criticalCases.requestedTileNo})`,
  tileLabel: sql<string | null>`coalesce(${tiles.name}, ${criticalCases.requestedTileName})`,
  issueType: criticalCases.issueType,
  secondaryIssueTypes: criticalCases.secondaryIssueTypes,
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
  /** "pending": only cases still waiting for the Listing team. */
  listing?: 'pending';
  page: number;
}

/** Server-side filtered, paginated case list. SALES users are always limited to their own cases. */
export async function listCases({ user, scope, q, status, listing, page }: ListCasesOptions) {
  const effectiveScope = canSeeAllCases(user) ? scope : 'mine';
  const filters: SQL[] = [];
  if (effectiveScope === 'mine') filters.push(eq(criticalCases.reportedBy, user.id));
  if (status) filters.push(eq(criticalCases.status, status));
  if (listing === 'pending') filters.push(and(eq(criticalCases.listingRequired, true), isNull(criticalCases.listedAt))!);
  if (q) {
    const p = `%${escapeLike(q)}%`;
    filters.push(
      or(
        ilike(criticalCases.caseCode, p),
        ilike(tiles.tileCode, p),
        ilike(tiles.name, p),
        ilike(criticalCases.requestedTileName, p),
        ilike(criticalCases.requestedTileNo, p),
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

  const [linkedTiles, events, photos] = await Promise.all([
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
        userId: caseEvents.userId,
        userName: users.name,
        userTeam: users.team,
      })
      .from(caseEvents)
      .leftJoin(users, eq(users.id, caseEvents.userId))
      .where(eq(caseEvents.caseId, id))
      .orderBy(asc(caseEvents.createdAt)),
    db
      .select({ id: caseAttachments.id, fileName: caseAttachments.fileName, contentType: caseAttachments.contentType })
      .from(caseAttachments)
      .where(eq(caseAttachments.caseId, id))
      .orderBy(asc(caseAttachments.position)),
  ]);
  return { ...c, linkedTiles, events, photos };
}

/** A photo already in storage, to be recorded with the case. */
export interface StoredPhoto {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  fileName: string | null;
}

/**
 * Creates an app case for the signed-in employee. reported_by always comes from the session, never the form.
 * `sku` is the item picked from the item sheet, as the server read it (null for "Tile not found").
 * Case code, case row, tile link, photo rows and CREATED event are written in one transaction.
 */
export async function createCase(user: CurrentUser, input: NewCaseInput, sku: SkuItem | null, photos: StoredPhoto[] = []) {
  return db.transaction(async (tx) => {
    // Items aren't stored in our database, but if a tile record with the same code exists (from the
    // WhatsApp history), link it so old and new cases about the same tile line up. Never created here.
    const [linked] = sku ? await tx.select({ id: tiles.id }).from(tiles).where(eq(tiles.tileCode, sku.code)).limit(1) : [];
    const tileId = linked?.id ?? null;

    const { rows } = await tx.execute<{ n: string }>(sql`SELECT nextval('critical_case_code_seq') AS n`);
    const caseCode = formatCaseCode(Number(rows[0].n));
    const now = new Date();

    const [created] = await tx
      .insert(criticalCases)
      .values({
        caseCode,
        tileId,
        reportedBy: user.id,
        reportedByName: user.name,
        reportedOn: now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
        // No tile record: the item has to be listed before the salesperson can close the case.
        listingRequired: !sku,
        issueType: input.issueType,
        secondaryIssueTypes: input.secondaryIssueTypes,
        description: input.description,
        requestedTileNo: sku?.code ?? null,
        requestedTileName: sku?.name ?? input.requestedTileName,
        tileColor: input.tileColor,
        tileSize: input.tileSize,
        tileFinish: input.tileFinish,
        tileBody: input.tileBody,
        tileVendor: sku?.vendor ?? null,
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

    if (tileId) {
      await tx.insert(caseTiles).values({ caseId: created.id, tileId, role: 'REQUESTED', position: 0 });
    }
    if (photos.length) {
      await tx
        .insert(caseAttachments)
        .values(photos.map((p, position) => ({ ...p, caseId: created.id, position, uploadedBy: user.id, createdAt: now })));
    }
    await tx.insert(caseEvents).values({
      caseId: created.id,
      userId: user.id,
      eventType: 'CREATED',
      newValue: { status: 'NEW', case_code: caseCode, ...(photos.length ? { photos: photos.length } : {}) },
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
 * Status change by a case handler (Supply team / admin), or a salesperson closing their own case.
 * Checked on the server: permission, app-created case only (historical WhatsApp cases stay untouched),
 * allowed transition, required note. Records a STATUS_CHANGED event with the old and new values.
 */
export async function updateCaseStatus(user: CurrentUser, caseId: string, action: StatusAction, note: string | null) {
  const def = STATUS_ACTIONS[action];
  if (def.noteRequired && !note) throw new CaseActionError(`Please add a note: ${def.noteLabel.toLowerCase()}`);

  return db.transaction(async (tx) => {
    const [c] = await tx
      .select({
        id: criticalCases.id,
        status: criticalCases.status,
        source: criticalCases.source,
        resolution: criticalCases.resolution,
        assignedTo: criticalCases.assignedTo,
        reportedBy: criticalCases.reportedBy,
        listingRequired: criticalCases.listingRequired,
        listedAt: criticalCases.listedAt,
      })
      .from(criticalCases)
      .where(eq(criticalCases.id, caseId))
      .for('update');
    if (!c) throw new CaseActionError('Case not found.');
    if (c.source !== 'APP') throw new CaseActionError('Historical WhatsApp cases are read-only.');
    const own = c.reportedBy === user.id;
    if (!canManageCases(user) && !(own && action === 'CLOSE')) {
      throw new CaseActionError(own ? 'You can close your own case; everything else is done by the Supply team.' : 'Only the Supply team can change case status.');
    }
    if (own && !canManageCases(user) && awaitingListing(c)) {
      throw new CaseActionError('This item isn’t listed yet. You can close the case once the Listing team gives the thumbs up.');
    }
    if (!statusActionsFor(user, c).includes(action)) {
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

/**
 * A case photo, if this user may see the case it belongs to (same rule as getCaseForUser).
 * null otherwise, so a photo of someone else's case looks exactly like a missing one.
 */
export async function getPhotoForUser(id: string, user: CurrentUser) {
  const [row] = await db
    .select({
      objectKey: caseAttachments.objectKey,
      contentType: caseAttachments.contentType,
      fileName: caseAttachments.fileName,
      reportedBy: criticalCases.reportedBy,
    })
    .from(caseAttachments)
    .innerJoin(criticalCases, eq(criticalCases.id, caseAttachments.caseId))
    .where(eq(caseAttachments.id, id))
    .limit(1);
  if (!row) return null;
  if (!canSeeAllCases(user) && row.reportedBy !== user.id) return null;
  return row;
}

/** How many photos a case has, when this user may add more; null when they may not (or it doesn't exist). */
export async function photoSlotsForUser(caseId: string, user: CurrentUser): Promise<number | null> {
  const [c] = await db
    .select({ source: criticalCases.source, reportedBy: criticalCases.reportedBy, photos: count(caseAttachments.id) })
    .from(criticalCases)
    .leftJoin(caseAttachments, eq(caseAttachments.caseId, criticalCases.id))
    .where(eq(criticalCases.id, caseId))
    .groupBy(criticalCases.id);
  if (!c || !canAddPhotos(user, c)) return null;
  return Number(c.photos);
}

/**
 * Records photos (already in storage) on an existing case, after them in order, with an UPDATED event.
 * Permission and the per-case limit are checked again under a row lock, so two uploads at once can't overshoot.
 */
export async function addCasePhotos(user: CurrentUser, caseId: string, photos: StoredPhoto[]) {
  return db.transaction(async (tx) => {
    const [c] = await tx
      .select({ source: criticalCases.source, reportedBy: criticalCases.reportedBy })
      .from(criticalCases)
      .where(eq(criticalCases.id, caseId))
      .for('update');
    if (!c || !canAddPhotos(user, c)) throw new CaseActionError('You can’t add photos to this case.');

    const [{ n, last }] = await tx
      .select({ n: count(), last: sql<number | null>`max(${caseAttachments.position})` })
      .from(caseAttachments)
      .where(eq(caseAttachments.caseId, caseId));
    if (Number(n) + photos.length > MAX_CASE_PHOTOS) {
      throw new CaseActionError(`This case can hold ${MAX_CASE_PHOTOS} photos; it already has ${n}.`);
    }

    const now = new Date();
    const start = last === null ? 0 : Number(last) + 1;
    await tx
      .insert(caseAttachments)
      .values(photos.map((p, i) => ({ ...p, caseId, position: start + i, uploadedBy: user.id, createdAt: now })));
    await tx.update(criticalCases).set({ updatedAt: now }).where(eq(criticalCases.id, caseId));
    await tx.insert(caseEvents).values({
      caseId,
      userId: user.id,
      eventType: 'UPDATED',
      newValue: { photos_added: photos.length },
      createdAt: now,
    });
    return { total: Number(n) + photos.length };
  });
}

export const MAX_MESSAGE_LENGTH = 2000;

/**
 * Adds a message to a case's conversation (a COMMENT event). Anyone who can see an app case may post,
 * on either side: the salesperson who reported it, the Supply team, managers and admins.
 */
export async function addCaseMessage(user: CurrentUser, caseId: string, text: string) {
  const body = text.trim();
  if (!body) throw new CaseActionError('Type a message first.');
  if (body.length > MAX_MESSAGE_LENGTH) throw new CaseActionError(`Keep the message under ${MAX_MESSAGE_LENGTH} characters.`);

  return db.transaction(async (tx) => {
    const [c] = await tx
      .select({ source: criticalCases.source, reportedBy: criticalCases.reportedBy })
      .from(criticalCases)
      .where(eq(criticalCases.id, caseId))
      .for('update');
    if (!c || !canPostMessages(user, c)) throw new CaseActionError('You can’t post messages on this case.');
    const now = new Date();
    await tx.update(criticalCases).set({ updatedAt: now }).where(eq(criticalCases.id, caseId));
    const [ev] = await tx
      .insert(caseEvents)
      .values({ caseId, userId: user.id, eventType: 'COMMENT', comment: body, createdAt: now })
      .returning({ id: caseEvents.id });
    return ev;
  });
}

/** App cases still waiting for the Listing team (dashboard counter), not counting closed ones. */
export async function getListingQueueCount() {
  const [{ n }] = await db
    .select({ n: count() })
    .from(criticalCases)
    .where(and(eq(criticalCases.listingRequired, true), isNull(criticalCases.listedAt), ne(criticalCases.status, 'CANCELLED')));
  return Number(n);
}

/**
 * The Listing team's thumbs up: the missing tile is now listed in the system. Recorded once, with who
 * and when, plus an optional note (e.g. the new tile code), which shows in the case's Messages.
 */
export async function markCaseListed(user: CurrentUser, caseId: string, note: string | null) {
  if (!canMarkListed(user)) throw new CaseActionError('Only the Listing team can confirm an item is listed.');
  return db.transaction(async (tx) => {
    const [c] = await tx
      .select({ source: criticalCases.source, listingRequired: criticalCases.listingRequired, listedAt: criticalCases.listedAt })
      .from(criticalCases)
      .where(eq(criticalCases.id, caseId))
      .for('update');
    if (!c) throw new CaseActionError('Case not found.');
    if (c.source !== 'APP' || !c.listingRequired) throw new CaseActionError('This case doesn’t need listing.');
    if (c.listedAt) throw new CaseActionError('Already marked as listed.');
    const now = new Date();
    await tx.update(criticalCases).set({ listedAt: now, listedBy: user.id, updatedAt: now }).where(eq(criticalCases.id, caseId));
    await tx.insert(caseEvents).values({
      caseId,
      userId: user.id,
      eventType: 'UPDATED',
      newValue: { listed: true },
      comment: note,
      createdAt: now,
    });
  });
}
