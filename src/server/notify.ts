import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { caseEvents, criticalCases, tiles, users } from '@/db/schema';
import { buildNewCaseEmail, parseRecipients } from '@/lib/case-email';
import { sendMail, smtpFromEnv } from '@/lib/smtp';

/**
 * Emails the case alert list (CASE_ALERT_EMAILS) about a newly created case, from our own mailbox over SMTP.
 * Never throws: a failed email must not affect the case, which is already saved.
 * Does nothing (with a log line) when SMTP_USER/SMTP_PASS or the recipient list is not configured, e.g. in tests.
 */
export async function sendNewCaseEmail(caseId: string) {
  const smtp = smtpFromEnv();
  const to = parseRecipients(process.env.CASE_ALERT_EMAILS);
  if (!smtp || to.length === 0) {
    console.info(`New case email skipped for ${caseId}: SMTP_USER/SMTP_PASS or CASE_ALERT_EMAILS is not set`);
    return;
  }

  try {
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
    const [created] = await db
      .select({ comment: caseEvents.comment })
      .from(caseEvents)
      .where(and(eq(caseEvents.caseId, caseId), eq(caseEvents.eventType, 'CREATED')))
      .limit(1);

    const c = row.case;
    const email = buildNewCaseEmail(
      {
        caseId: c.id,
        caseCode: c.caseCode,
        issueType: c.issueType,
        severity: c.severity,
        tileCode: row.tileCode,
        tileLabel: row.tileName ?? c.requestedTileName,
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
      },
      process.env.APP_URL,
    );

    await sendMail(smtp.cfg, { from: smtp.from, to, subject: email.subject, html: email.html, text: email.text });
    console.info(`New case email sent for ${caseId} to ${to.length} recipient(s)`);
  } catch (e) {
    console.error(`New case email failed for ${caseId}:`, e);
  }
}
