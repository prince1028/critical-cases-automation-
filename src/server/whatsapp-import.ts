import 'server-only';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { caseEvents, caseTiles, criticalCases, tiles, users } from '@/db/schema';
import { TILE_FACTS } from '@/import/tile-metadata';
import { extractCase, type ExtractedCase } from '@/lib/whatsapp-cases';
import { classifyMessages, messageHash, parseWhatsAppExport } from '@/lib/whatsapp';

/**
 * WhatsApp TXT import: the ingestion layer that feeds the analytics dashboard.
 *
 *   WhatsApp -> Export chat -> .txt -> this importer -> critical_cases -> analytics
 *
 * IDEMPOTENT. The chat is exported roughly every two weeks, so exports overlap heavily. Every case
 * is keyed by a deterministic sha256 of (message date + time + sender + text) written to
 * critical_cases.import_hash, which is UNIQUE. Re-uploading the same file, or an export that
 * contains three weeks of already-imported history, inserts nothing. Nothing is keyed on a row
 * number, an array index or the upload time.
 *
 * Historical data is preserved: rows are only ever inserted (never updated or deleted) and are
 * written with source = 'WHATSAPP_HISTORICAL', so they stay distinguishable from app-created cases
 * and keep the exact message in source_messages.
 */

export interface ImportSummary {
  fileName: string;
  /** Every line of the file. */
  messagesProcessed: number;
  /** Messages that read like a critical-case report. */
  caseMessages: number;
  /** New cases written to critical_cases. */
  newCases: number;
  /** Case messages already present (same fingerprint) - the idempotency counter. */
  duplicatesSkipped: number;
  /** Of the new cases, how many were flagged needs_review. */
  needsReview: number;
  /** New tiles created because a message named a code the tiles table did not have. */
  tilesCreated: number;
  /** Messages that were chatter or carried no critical signal. */
  skippedMessages: number;
  /** System notices (encryption banner, deletions). */
  systemLines: number;
  /** Lines that could not be read as a message at all. */
  unparsedLines: number;
  /** Cases that could not be written, with the reason. */
  errors: { line: number; message: string; reason: string }[];
  /** Why the imported cases were flagged for review. */
  reviewReasons: Record<string, number>;
  /** Messages per day that produced a case, so a gap in the export is visible. */
  dateRange: { from: string; to: string } | null;
  finishedAt: string;
}

const MAX_BYTES = 8 * 1024 * 1024;

/** Names in the users table, so a sender can be recognised instead of always flagged as unknown. */
async function knownReporters(): Promise<string[]> {
  const rows = await db.select({ name: users.name }).from(users);
  return rows.map((r) => r.name);
}

/**
 * Imports one exported chat. Safe to run repeatedly with the same or an overlapping file.
 * Throws only when the file itself cannot be read at all; per-message problems are reported in
 * `summary.errors` and never abort the import.
 */
export async function importWhatsAppExport(file: File): Promise<ImportSummary> {
  if (file.size > MAX_BYTES) throw new Error('That file is larger than 8 MB. Export the chat without media.');
  const raw = await file.text();
  if (!raw.trim()) throw new Error('That file is empty.');

  const { messages, unparsedLines, systemLines } = parseWhatsAppExport(raw);
  const verdicts = classifyMessages(messages);
  const isCase = verdicts.filter((v) => v.isCase);
  const senders = await knownReporters().catch(() => [] as string[]);

  const summary: ImportSummary = {
    fileName: file.name || 'whatsapp-export.txt',
    messagesProcessed: messages.length,
    caseMessages: isCase.length,
    newCases: 0,
    duplicatesSkipped: 0,
    needsReview: 0,
    tilesCreated: 0,
    skippedMessages: verdicts.length - isCase.length,
    systemLines,
    unparsedLines,
    errors: [],
    reviewReasons: {},
    dateRange: null,
    finishedAt: new Date().toISOString(),
  };

  if (!isCase.length) return summary;

  // One fingerprint -> one hash. Computed up front so the dedup check is a single query.
  const prepared: { hash: string; extracted: ExtractedCase; line: number }[] = [];
  for (const v of isCase) {
    const extracted = extractCase(v.message, { knownReporters: senders });
    if (!extracted) continue;
    prepared.push({ hash: await messageHash(v.message), extracted, line: v.message.line });
  }

  const existing = await db
    .select({ hash: criticalCases.importHash })
    .from(criticalCases)
    .where(inArray(criticalCases.importHash, prepared.map((p) => p.hash)));
  const seen = new Set(existing.map((r) => r.hash).filter((h): h is string => !!h));

  const importedAt = new Date();
  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  for (const { hash, extracted, line } of prepared) {
    if (seen.has(hash)) {
      summary.duplicatesSkipped++;
      continue;
    }
    // Claim the fingerprint inside this run too, so two identical lines in one file insert once.
    seen.add(hash);

    try {
      await insertCase(hash, extracted, summary, importedAt);
      summary.newCases++;
      if (extracted.needsReview) {
        summary.needsReview++;
        for (const r of extracted.reviewReasons) summary.reviewReasons[r] = (summary.reviewReasons[r] ?? 0) + 1;
      }
      if (!dateFrom || extracted.reportedOn < dateFrom) dateFrom = extracted.reportedOn;
      if (!dateTo || extracted.reportedOn > dateTo) dateTo = extracted.reportedOn;
    } catch (e) {
      // Lost the race with a concurrent import of the same message: a duplicate, not a failure.
      if (e instanceof Error && 'duplicate' in e && e.duplicate === true) {
        summary.duplicatesSkipped++;
        continue;
      }
      const message = e instanceof Error ? e.message : String(e);
      if (/duplicate key|unique/i.test(message)) {
        summary.duplicatesSkipped++;
        continue;
      }
      summary.errors.push({ line, message: extracted.sourceMessage.slice(0, 140), reason: message });
    }
  }

  if (dateFrom && dateTo) summary.dateRange = { from: dateFrom, to: dateTo };
  return summary;
}

/** One transaction per case: tile rows, the case, its tile links and its import event. */
async function insertCase(hash: string, c: ExtractedCase, summary: ImportSummary, importedAt: Date): Promise<void> {
  let createdTiles = 0;

  await db.transaction(async (tx) => {
    const tileIds: string[] = [];
    for (const code of c.tileCodes) {
      const facts = TILE_FACTS[code];
      const inserted = await tx
        .insert(tiles)
        .values({
          tileCode: code,
          codeType: facts?.codeType ?? 'UNKNOWN',
          name: facts?.name ?? null,
          brand: facts?.brand ?? null,
          supplier: facts?.supplier ?? null,
          supplierCode: facts?.supplierCode ?? null,
        })
        .onConflictDoNothing({ target: tiles.tileCode })
        .returning({ id: tiles.id });
      if (inserted.length) {
        createdTiles++;
        tileIds.push(inserted[0].id);
      } else {
        const [found] = await tx.select({ id: tiles.id }).from(tiles).where(eq(tiles.tileCode, code));
        if (found) tileIds.push(found.id);
      }
    }

    // Historical dates, IST midnight, so the analytics put the case on the day it was reported.
    const createdAt = new Date(`${c.reportedOn}T00:00:00+05:30`);
    const [created] = await tx
      .insert(criticalCases)
      .values({
        reportedByName: c.reportedByName,
        reportedOn: c.reportedOn,
        issueType: c.issueType,
        secondaryIssueTypes: c.secondaryIssueTypes,
        // The sheet import puts the sheet's raw "Issue Type" cell here. A chat message has no such
        // field, so nothing is invented: the exact wording lives in source_messages below.
        originalIssueType: null,
        description: c.description,
        requestedTileNo: c.requestedTileNo || null,
        competitorReferences: c.competitorReferences,
        requiredQuantity: c.requiredQuantity,
        requiredQuantityText: c.requiredQuantityText,
        availableQuantity: c.availableQuantity,
        availableQuantityText: c.availableQuantityText,
        unit: c.unit,
        alternativeTileText: c.alternativeTileText,
        alternativeAccepted: c.alternativeAccepted,
        status: c.status,
        // Same value the spreadsheet import uses: this row came out of the WhatsApp chat.
        source: 'WHATSAPP_HISTORICAL',
        sourceMessages: c.sourceMessage,
        extractionConfidence: c.needsReview ? 'LOW' : 'MEDIUM',
        needsReview: c.needsReview,
        reviewReasons: c.reviewReasons.length ? c.reviewReasons : null,
        importHash: hash,
        importedAt,
        createdAt,
        updatedAt: importedAt,
        tileId: tileIds[0] ?? null,
      })
      .onConflictDoNothing({ target: criticalCases.importHash })
      .returning({ id: criticalCases.id });

    // Lost the race with a concurrent import of the same message: nothing was written.
    if (!created) throw Object.assign(new Error('duplicate import_hash'), { duplicate: true });

    if (tileIds.length) {
      await tx.insert(caseTiles).values(
        tileIds.map((tileId, i) => ({ caseId: created.id, tileId, role: 'REQUESTED' as const, position: i })),
      );
    }
    await tx.insert(caseEvents).values({
      caseId: created.id,
      eventType: 'HISTORICAL_IMPORT',
      newValue: {
        channel: 'whatsapp_txt',
        source_file: summary.fileName,
        sender: c.sender,
        tile_numbers: c.tileCodes,
        review_reasons: c.reviewReasons,
      },
      comment: `Imported from the WhatsApp export "${summary.fileName}"`,
    });
  });

  // Counted after the transaction committed, so a rollback cannot inflate the summary.
  summary.tilesCreated += createdTiles;
}

/** Recent WhatsApp TXT imports, read from the import events so no extra table is needed. */
export async function recentTxtImports(limit = 10) {
  const rows = await db.execute<{
    importedAt: Date | null;
    file: string | null;
    channel: string | null;
    reasonCount: number;
  }>(sql`
    SELECT max(e.created_at) AS "importedAt",
           max(e.new_value->>'source_file') AS file,
           max(e.new_value->>'channel') AS channel,
           count(*)::int AS "reasonCount"
    FROM case_events e
    WHERE e.event_type = 'HISTORICAL_IMPORT' AND e.new_value->>'channel' = 'whatsapp_txt'
    GROUP BY date_trunc('hour', e.created_at)
    ORDER BY 1 DESC
    LIMIT ${limit}`);
  return rows.rows;
}