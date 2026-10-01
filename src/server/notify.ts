import 'server-only';
import { and, eq } from 'drizzle-orm';
import { Resend } from 'resend';
import { db } from '@/db';
import { caseEvents, criticalCases, tiles, users } from '@/db/schema';
import { buildNewCaseEmail, parseRecipients } from '@/lib/case-email';

/**
 * Emails the case alert list (CASE_ALERT_EMAILS) about a newly created case, via Resend.
 * Never throws: a failed email must not affect the case, which is already saved.
 * Does nothing (with a log line) when RESEND_API_KEY or the recipient list is not configured, e.g. in tests.
 */
export async function sendNewCaseEmail(caseId: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = parseRecipients(process.env.CASE_ALERT_EMAILS);
  if (!apiKey || to.length === 0) {
    console.info(`New case email skipped for ${caseId}: RESEND_API_KEY or CASE_ALERT_EMAILS is not set`);
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

    const { data, error } = await new Resend(apiKey).emails.send(
      {
        from: process.env.EMAIL_FROM || 'Florzy Critical Cases <onboarding@resend.dev>',
        to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      },
      // Resend drops a repeat send with the same key, so a retry can never email the team twice.
      { idempotencyKey: `case-created/${caseId}` },
    );
    if (error) console.error(`New case email failed for ${caseId}:`, error.name, error.message);
    else console.info(`New case email sent for ${caseId} (${data?.id}) to ${to.length} recipient(s)`);
  } catch (e) {
    console.error(`New case email failed for ${caseId}:`, e);
  }
}
