import 'server-only';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { caseAttachments, caseEvents, criticalCases, tiles, users, type IssueType } from '@/db/schema';
import { alertRecipients, buildNewCaseEmail } from '@/lib/case-email';
import { sendMail, smtpFromEnv, type MailAttachment } from '@/lib/smtp';
import { getObject } from './storage';

/** Gmail's limit is 25 MB including base64 overhead; stay well under it. */
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/** The case's photos as email attachments, skipping any that would not fit or cannot be read. */
async function loadPhotos(caseId: string): Promise<{ count: number; files: MailAttachment[] }> {
  const rows = await db
    .select({ objectKey: caseAttachments.objectKey, contentType: caseAttachments.contentType, sizeBytes: caseAttachments.sizeBytes, fileName: caseAttachments.fileName })
    .from(caseAttachments)
    .where(eq(caseAttachments.caseId, caseId))
    .orderBy(caseAttachments.position);
  const files: MailAttachment[] = [];
  let total = 0;
  for (const [i, r] of rows.entries()) {
    if (total + r.sizeBytes > MAX_ATTACHMENT_BYTES) break;
    try {
      const obj = await getObject(r.objectKey);
      if (!obj) continue;
      files.push({ filename: r.fileName ?? `photo-${i + 1}`, contentType: r.contentType, content: new Uint8Array(await obj.arrayBuffer()) });
      total += r.sizeBytes;
    } catch (e) {
      console.warn(`Photo ${r.objectKey} not attached to the alert:`, e);
    }
  }
  return { count: rows.length, files };
}

/**
 * Emails the Supply team (active members with an email on their profile) plus CASE_ALERT_EMAILS about a
 * newly created case, from our own mailbox over SMTP.
 * Never throws: a failed email must not affect the case, which is already saved.
 * Does nothing (with a log line) when SMTP_USER/SMTP_PASS is not set (e.g. in tests) or nobody is on the list.
 */
export async function sendNewCaseEmail(caseId: string) {
  const smtp = smtpFromEnv();
  if (!smtp) {
    console.info(`New case email skipped for ${caseId}: SMTP_USER/SMTP_PASS is not set`);
    return;
  }

  try {
    const members = await db
      .select({ email: users.email, team: users.team, active: users.active })
      .from(users)
      .where(and(eq(users.active, true), isNotNull(users.email)));
    const [row] = await db
      .select({
        case: criticalCases,
        tileCode: tiles.tileCode,
        tileName: tiles.name,
        reporterName: users.name,
        reporterTeam: users.team,
      })
      .from(criticalCases)
      .leftJoin(tiles, eq(tiles.id, criticalCases.tileId))
      .leftJoin(users, eq(users.id, criticalCases.reportedBy))
      .where(eq(criticalCases.id, caseId))
      .limit(1);
    if (!row) return;
    const to = alertRecipients(process.env.CASE_ALERT_EMAILS, members, { listing: row.case.listingRequired });
    if (to.length === 0) {
      console.info(`New case email skipped for ${caseId}: no Supply/Listing team emails and CASE_ALERT_EMAILS is empty`);
      return;
    }
    const [created] = await db
      .select({ comment: caseEvents.comment })
      .from(caseEvents)
      .where(and(eq(caseEvents.caseId, caseId), eq(caseEvents.eventType, 'CREATED')))
      .limit(1);

    const attachments = await loadPhotos(caseId);
    const c = row.case;
    const email = buildNewCaseEmail(
      {
        caseId: c.id,
        caseCode: c.caseCode,
        issueType: c.issueType,
        secondaryIssueTypes: c.secondaryIssueTypes as IssueType[] | null,
        severity: c.severity,
        tileCode: row.tileCode ?? c.requestedTileNo,
        tileDetails: [c.tileColor, c.tileSize, c.tileFinish, c.tileBody].filter(Boolean).join(' · ') || null,
        tileVendor: c.tileVendor,
        tileLabel: c.requestedTileNo ? c.requestedTileName : (row.tileName ?? c.requestedTileName),
        description: c.description,
        requestedColor: c.requestedColor,
        requestedSize: c.requestedSize,
        requestedFinish: c.requestedFinish,
        requiredQuantity: c.requiredQuantity,
        availableQuantity: c.availableQuantity,
        unit: c.unit,
        alternativeTileText: c.alternativeTileText,
        notes: created?.comment ?? null,
        reporterName: row.reporterName ?? c.reportedByName ?? 'Unknown',
        reporterTeam: row.reporterTeam,
        createdAt: c.createdAt,
        photoCount: attachments.count,
        photosAttached: attachments.files.length,
        listingRequired: c.listingRequired,
      },
      process.env.APP_URL,
    );

    await sendMail(smtp.cfg, { from: smtp.from, to, subject: email.subject, html: email.html, text: email.text, attachments: attachments.files });
    console.info(`New case email sent for ${caseId} to ${to.length} recipient(s)`);
  } catch (e) {
    console.error(`New case email failed for ${caseId}:`, e);
  }
}
