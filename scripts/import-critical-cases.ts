/**
 * Historical Critical Case import (WhatsApp -> spreadsheet -> Neon).
 *
 *   npm run import:critical-cases -- ./path/to/Florzy_Critical_Cases_v2.xlsx
 *
 * Idempotent: each case gets a deterministic import_hash; re-running skips cases already imported.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { db, pool } from '../src/db';
import { caseEvents, caseTiles, criticalCases, tiles } from '../src/db/schema';
import { TILE_FACTS } from '../src/import/tile-metadata';
import { parseTileReferences, type TileRef } from '../src/import/tile-references';
import {
  clean,
  normalizeIssueTypes,
  normalizeStatus,
  normalizeUnit,
  parseQuantity,
  parseSheetDate,
  parseYesNo,
} from '../src/lib/normalize';

const SHEET = 'Critical Cases';
// Actual headers of Florzy_Critical_Cases_v2.xlsx -> internal keys.
const COLUMNS = {
  caseCode: 'Case ID',
  date: 'Date',
  employee: 'Employee',
  tileNo: 'Tile No',
  tileName: 'Tile Name',
  color: 'Color',
  size: 'Size',
  finish: 'Finish',
  issueType: 'Issue Type',
  requiredQty: 'Required Quantity',
  availableQty: 'Available Quantity',
  unit: 'Unit',
  customerRequirement: 'Customer Requirement',
  alternativeTile: 'Alternative Tile',
  alternativeAccepted: 'Alternative Accepted',
  status: 'Status',
  resolution: 'Resolution',
  confidence: 'Confidence',
  sourceMessages: 'Source Messages',
  reviewerNotes: 'Reviewer Notes',
  imageEvidence: 'Image Evidence',
} as const;
type RowData = Record<keyof typeof COLUMNS, string | null>;

const OUT_DIR = path.resolve('output');
const IMPORT_COMMENT = 'Imported from the historical WhatsApp group "Florzy- Critical supply cases" (Apr-Sep 2026) via spreadsheet';

function cellText(v: ExcelJS.CellValue): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return v.result === undefined || v.result === null ? null : String(v.result);
    if ('text' in v) return String(v.text);
    return null;
  }
  return String(v);
}

function importHash(r: RowData, reportedOn: string): string {
  const stable = [reportedOn, r.employee, r.tileNo, r.issueType, r.customerRequirement, r.sourceMessages]
    .map((x) => (x ?? '').replace(/\s+/g, ' ').trim().toLowerCase());
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

const csv = (rows: (string | number | null | undefined)[][]) =>
  rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n') + '\n';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: npm run import:critical-cases -- ./path/to/Florzy_Critical_Cases_v2.xlsx');
  const filePath = path.resolve(file);
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`Sheet "${SHEET}" not found. Sheets: ${wb.worksheets.map((w) => w.name).join(', ')}`);

  const headerIndex = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => headerIndex.set(String(cellText(cell.value) ?? '').trim(), col));
  const missing = Object.values(COLUMNS).filter((h) => !headerIndex.has(h));
  if (missing.length) throw new Error(`Spreadsheet is missing expected columns: ${missing.join(', ')}`);

  const rows: { excelRow: number; data: RowData }[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const data = {} as RowData;
    for (const [key, header] of Object.entries(COLUMNS)) {
      data[key as keyof RowData] = cellText(row.getCell(headerIndex.get(header)!).value)?.trim() || null;
    }
    if (Object.values(data).some((v) => v)) rows.push({ excelRow: n, data });
  });

  const stats = {
    excelRows: rows.length,
    casesImported: 0,
    duplicatesSkipped: 0,
    invalidRows: 0,
    tilesCreated: 0,
    tileRefsMatchedExisting: 0,
    casesLinkedToTile: 0,
    casesNeedingReview: 0,
    casesWithoutTileNumber: 0,
    casesWithCompetitorCodeOnly: 0,
    reviewReasons: {} as Record<string, number>,
    issueTypes: {} as Record<string, number>,
    statusMapping: {} as Record<string, number>,
    unmappedIssueValues: [] as string[],
  };
  const errors: (string | number | null)[][] = [['excel_row', 'case_code', 'field', 'value', 'error']];
  const unmatched: (string | number | null)[][] = [
    ['excel_row', 'case_code', 'date', 'employee', 'reason', 'tile_no_cell', 'tile_name_cell', 'competitor_references', 'unparsed_parts'],
  ];
  const importedAt = new Date();

  for (const { excelRow, data: r } of rows) {
    // --- validate ---
    const reportedOn = parseSheetDate(r.date);
    if (!reportedOn) {
      stats.invalidRows++;
      errors.push([excelRow, r.caseCode, 'Date', r.date, 'Invalid or missing date; row not imported (no date invented)']);
      continue;
    }

    const issues = normalizeIssueTypes(r.issueType);
    const status = normalizeStatus(r.status);
    const refs = parseTileReferences(clean(r.tileNo));
    const confidence = (['HIGH', 'MEDIUM', 'LOW'] as const).find((c) => c === r.confidence?.toUpperCase()) ?? null;

    const reasons: string[] = [];
    if (refs.tiles.length === 0) {
      if (refs.competitor.length) {
        reasons.push('COMPETITOR_CODE_ONLY');
        stats.casesWithCompetitorCodeOnly++;
      } else {
        reasons.push('NO_TILE_NUMBER');
        stats.casesWithoutTileNumber++;
      }
    }
    if (refs.unparsed.length) reasons.push('TILE_REFERENCE_UNPARSED');
    if (issues.unmapped.length) {
      reasons.push('ISSUE_TYPE_UNMAPPED');
      stats.unmappedIssueValues.push(...issues.unmapped);
      errors.push([excelRow, r.caseCode, 'Issue Type', issues.unmapped.join('; '), 'Mapped to OTHER; original kept in original_issue_type']);
    }
    if (status.reviewReason) reasons.push(status.reviewReason);
    if (confidence === 'LOW') reasons.push('LOW_EXTRACTION_CONFIDENCE');
    if (/CONFLICT/i.test(r.reviewerNotes ?? '')) reasons.push('DATA_CONFLICT');

    if (refs.tiles.length === 0 || refs.unparsed.length) {
      unmatched.push([
        excelRow, r.caseCode, reportedOn, r.employee,
        refs.tiles.length ? 'TILE_REFERENCE_UNPARSED' : refs.competitor.length ? 'COMPETITOR_CODE_ONLY' : 'NO_TILE_NUMBER',
        r.tileNo, r.tileName, refs.competitor.join(' | '), refs.unparsed.join(' | '),
      ]);
    }

    const hash = importHash(r, reportedOn);
    const existing = await db.select({ id: criticalCases.id }).from(criticalCases).where(eq(criticalCases.importHash, hash)).limit(1);
    if (existing.length) {
      stats.duplicatesSkipped++;
      continue;
    }


    // --- write (one transaction per case) ---
    const createdAt = new Date(`${reportedOn}T00:00:00+05:30`); // historical date, IST
    await db.transaction(async (tx) => {
      const tileIds: { ref: TileRef; id: string }[] = [];
      for (const ref of refs.tiles) {
        const facts = TILE_FACTS[ref.tileCode];
        const inserted = await tx
          .insert(tiles)
          .values({
            tileCode: ref.tileCode,
            codeType: facts?.codeType ?? ref.codeType,
            name: facts?.name ?? null,
            brand: facts?.brand ?? ref.brand ?? null,
            supplier: facts?.supplier ?? null,
            supplierCode: facts?.supplierCode ?? ref.supplierCode ?? null,
          })
          .onConflictDoNothing({ target: tiles.tileCode })
          .returning({ id: tiles.id });
        if (inserted.length) {
          stats.tilesCreated++;
          tileIds.push({ ref, id: inserted[0].id });
        } else {
          const [found] = await tx.select({ id: tiles.id }).from(tiles).where(eq(tiles.tileCode, ref.tileCode));
          stats.tileRefsMatchedExisting++;
          tileIds.push({ ref, id: found.id });
        }
      }

      const primary = tileIds.find((t) => t.ref.role === 'REQUESTED') ?? tileIds[0];
      const [created] = await tx
        .insert(criticalCases)
        .values({
          caseCode: r.caseCode,
          tileId: primary?.id ?? null,
          reportedByName: r.employee,
          reportedOn,
          issueType: issues.primary,
          secondaryIssueTypes: issues.secondary.length ? issues.secondary : null,
          originalIssueType: r.issueType,
          description: clean(r.customerRequirement),
          requestedTileName: clean(r.tileName),
          requestedTileNo: clean(r.tileNo),
          requestedColor: clean(r.color),
          requestedSize: clean(r.size),
          requestedFinish: clean(r.finish),
          competitorReferences: refs.competitor.length ? refs.competitor : null,
          requiredQuantity: parseQuantity(r.requiredQty)?.toString() ?? null,
          requiredQuantityText: clean(r.requiredQty),
          availableQuantity: parseQuantity(r.availableQty)?.toString() ?? null,
          availableQuantityText: clean(r.availableQty),
          unit: normalizeUnit(r.unit) ?? clean(r.unit),
          alternativeTileText: clean(r.alternativeTile),
          alternativeAccepted: parseYesNo(r.alternativeAccepted),
          alternativeAcceptedText: clean(r.alternativeAccepted),
          status: status.status,
          originalStatus: r.status,
          resolution: clean(r.resolution),
          source: 'WHATSAPP_HISTORICAL',
          sourceMessages: r.sourceMessages,
          imageEvidence: clean(r.imageEvidence),
          reviewerNotes: clean(r.reviewerNotes),
          extractionConfidence: confidence,
          needsReview: reasons.length > 0,
          reviewReasons: reasons.length ? reasons : null,
          importHash: hash,
          importedAt,
          createdAt,
          updatedAt: importedAt,
        })
        .onConflictDoNothing({ target: criticalCases.importHash })
        .returning({ id: criticalCases.id });

      if (!created) {
        // Raced with a concurrent import: treat as duplicate and undo tile inserts from this row.
        throw Object.assign(new Error('duplicate'), { duplicate: true });
      }

      if (tileIds.length) {
        await tx.insert(caseTiles).values(
          tileIds.map((t, i) => ({ caseId: created.id, tileId: t.id, role: t.ref.role, position: i })),
        );
      }
      await tx.insert(caseEvents).values({
        caseId: created.id,
        eventType: 'HISTORICAL_IMPORT',
        newValue: {
          case_code: r.caseCode,
          source_file: path.basename(filePath),
          excel_row: excelRow,
          original_status: r.status,
          original_issue_type: r.issueType,
          extraction_confidence: confidence,
          tile_numbers: refs.tiles.map((t) => t.tileCode),
          review_reasons: reasons,
        },
        comment: IMPORT_COMMENT,
      });
    }).then(
      () => {
        stats.casesImported++;
        if (refs.tiles.length) stats.casesLinkedToTile++;
        if (reasons.length) stats.casesNeedingReview++;
        for (const reason of reasons) stats.reviewReasons[reason] = (stats.reviewReasons[reason] ?? 0) + 1;
        stats.issueTypes[issues.primary] = (stats.issueTypes[issues.primary] ?? 0) + 1;
        const key = `${r.status} -> ${status.status}`;
        stats.statusMapping[key] = (stats.statusMapping[key] ?? 0) + 1;
      },
      (e) => {
        if (e?.duplicate) stats.duplicatesSkipped++;
        else throw e;
      },
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    generated_at: importedAt.toISOString(),
    source_file: filePath,
    sheet: SHEET,
    column_mapping: COLUMNS,
    stats,
    notes: [
      'tile_id is set only when the "Tile No" cell holds one of our tile numbers (Florzy ID or vendor code). Competitor/retailer codes are kept in competitor_references, never turned into tiles.',
      'Tile metadata is filled only from src/import/tile-metadata.ts (facts stated in chat or on photographed labels); everything else is NULL.',
      'Quantities are numeric only when the cell states a single number; the original text is always kept in *_quantity_text.',
      'Historical statuses: Resolved->RESOLVED; Resolution offered / In progress->IN_PROGRESS; Open->NEW; Unresolved and Unknown->NEW with needs_review. resolved_at is NULL (no resolution timestamps in the source).',
      'created_at / reported_on = the case date from the sheet (IST midnight); imported_at = when this import ran.',
    ],
  };
  writeFileSync(path.join(OUT_DIR, 'import-report.json'), JSON.stringify(report, null, 2));
  writeFileSync(path.join(OUT_DIR, 'import-errors.csv'), csv(errors));
  writeFileSync(path.join(OUT_DIR, 'unmatched-tiles.csv'), csv(unmatched));

  const n = (x: number) => x.toLocaleString('en-IN').padStart(8);
  console.log(`
========================================
CRITICAL CASE IMPORT COMPLETE
========================================

Excel rows:              ${n(stats.excelRows)}

Cases imported:          ${n(stats.casesImported)}
Duplicates skipped:      ${n(stats.duplicatesSkipped)}

Tiles created:           ${n(stats.tilesCreated)}
Existing tiles matched:  ${n(stats.tileRefsMatchedExisting)}
Cases linked to a tile:  ${n(stats.casesLinkedToTile)}

Cases needing review:    ${n(stats.casesNeedingReview)}
Missing tile numbers:    ${n(stats.casesWithoutTileNumber)}
Competitor code only:    ${n(stats.casesWithCompetitorCodeOnly)}
Invalid rows:            ${n(stats.invalidRows)}

========================================
Reports: output/import-report.json, output/import-errors.csv, output/unmatched-tiles.csv
`);
}

main()
  .catch((e) => {
    console.error('IMPORT FAILED:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
