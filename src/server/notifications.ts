import 'server-only';
import { and, count, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { caseEvents, criticalCases, notifications, users, type NotificationKind } from '@/db/schema';
import { buildUpdateEmail } from '@/lib/case-email';
import { messageRecipients, newCaseRecipients, updateRecipients, type CaseParties, type Person } from '@/lib/notify-rules';
import { awaitingListing } from '@/lib/permissions';
import { sendMail, smtpFromEnv } from '@/lib/smtp';

/**
 * Notifications: a row per recipient for the bell, plus an email to recipients with an email on their
 * profile. Called after the response (after()), and never throws: a failed notification must not affect
 * the action that caused it.
 */

async function loadCase(caseId: string) {
  const [c] = await db
    .select({
      id: criticalCases.id,
      caseCode: criticalCases.caseCode,
      reportedBy: criticalCases.reportedBy,
      assignedTo: criticalCases.assignedTo,
      listingRequired: criticalCases.listingRequired,
      listedAt: criticalCases.listedAt,
    })
    .from(criticalCases)
    .where(eq(criticalCases.id, caseId))
    .limit(1);
  if (!c) return null;
  const rows = await db
    .selectDistinct({ userId: caseEvents.userId })
    .from(caseEvents)
    .where(and(eq(caseEvents.caseId, caseId), isNotNull(caseEvents.userId)));
  const parties: CaseParties = {
    reporterId: c.reportedBy,
    assigneeId: c.assignedTo,
    participantIds: rows.map((r) => r.userId!),
    awaitingListing: awaitingListing(c),
  };
  return { c, parties };
}

const loadPeople = (): Promise<Person[]> =>
  db.select({ id: users.id, team: users.team, role: users.role, active: users.active }).from(users);

async function deliver(opts: {
  caseId: string;
  caseCode: string | null;
  actorId: string | null;
  kind: NotificationKind;
  title: string;
  body: string | null;
  recipients: string[];
  /** New cases already get the detailed new-case email; don't send a second one. */
  email?: boolean;
}) {
  const { recipients } = opts;
  if (!recipients.length) return;
  const now = new Date();
  await db.insert(notifications).values(
    recipients.map((userId) => ({
      userId,
      caseId: opts.caseId,
      actorId: opts.actorId,
      kind: opts.kind,
      title: opts.title.slice(0, 200),
      body: opts.body,
      createdAt: now,
    })),
  );
  if (opts.email === false) return;
  const smtp = smtpFromEnv();
  if (!smtp) return;
  const emails = await db
    .select({ email: users.email })
    .from(users)
    .where(and(inArray(users.id, recipients), eq(users.active, true), isNotNull(users.email)));
  const to = [...new Set(emails.map((e) => e.email!.toLowerCase()))];
  if (!to.length) return;
  const mail = buildUpdateEmail({ caseId: opts.caseId, caseCode: opts.caseCode, title: opts.title, body: opts.body }, process.env.APP_URL);
  // One message per person, so nobody sees the others' addresses.
  for (const addr of to) {
    try {
      await sendMail(smtp.cfg, { from: smtp.from, to: [addr], subject: mail.subject, html: mail.html, text: mail.text });
    } catch (e) {
      console.error(`Notification email to ${addr} failed:`, e);
    }
  }
}

async function safely(what: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.error(`Notification (${what}) failed:`, e);
  }
}

const preview = (s: string | null, n = 300) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

export const notifyNewCase = (caseId: string, actor: { id: string; name: string }) =>
  safely('new case', async () => {
    const loaded = await loadCase(caseId);
    if (!loaded) return;
    const { c, parties } = loaded;
    await deliver({
      caseId,
      caseCode: c.caseCode,
      actorId: actor.id,
      kind: 'NEW_CASE',
      title: `New case ${c.caseCode ?? ''} from ${actor.name}${parties.awaitingListing ? ' · needs listing' : ''}`.replace('  ', ' '),
      body: null,
      recipients: newCaseRecipients(await loadPeople(), parties),
      email: false,
    });
  });

export const notifyMessage = (caseId: string, sender: { id: string; name: string }, text: string) =>
  safely('message', async () => {
    const loaded = await loadCase(caseId);
    if (!loaded) return;
    await deliver({
      caseId,
      caseCode: loaded.c.caseCode,
      actorId: sender.id,
      kind: 'MESSAGE',
      title: `New message from ${sender.name}`,
      body: preview(text),
      recipients: messageRecipients(await loadPeople(), loaded.parties, sender.id),
    });
  });

export const notifyStatus = (caseId: string, actor: { id: string; name: string }, what: string, note: string | null) =>
  safely('status', async () => {
    const loaded = await loadCase(caseId);
    if (!loaded) return;
    await deliver({
      caseId,
      caseCode: loaded.c.caseCode,
      actorId: actor.id,
      kind: 'STATUS',
      title: `${what} by ${actor.name}`,
      body: preview(note),
      recipients: updateRecipients(await loadPeople(), loaded.parties, actor.id),
    });
  });

export const notifyListed = (caseId: string, actor: { id: string; name: string }, note: string | null) =>
  safely('listed', async () => {
    const loaded = await loadCase(caseId);
    if (!loaded) return;
    await deliver({
      caseId,
      caseCode: loaded.c.caseCode,
      actorId: actor.id,
      kind: 'LISTED',
      title: `Item listed 👍 by ${actor.name}`,
      body: preview(note) ?? 'The tile is now in the item list. You can close the case when you’re done.',
      recipients: updateRecipients(await loadPeople(), loaded.parties, actor.id),
    });
  });

// ---------- The bell ----------

export async function unreadCount(userId: string) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(n);
}

export async function listNotifications(userId: string, limit = 50) {
  return db
    .select({
      id: notifications.id,
      caseId: notifications.caseId,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      caseCode: criticalCases.caseCode,
    })
    .from(notifications)
    .leftJoin(criticalCases, eq(criticalCases.id, notifications.caseId))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/** Marks this user's notifications read: all of them, or only those about one case (opening the case). */
export async function markNotificationsRead(userId: string, caseId?: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), caseId ? eq(notifications.caseId, caseId) : undefined));
}
