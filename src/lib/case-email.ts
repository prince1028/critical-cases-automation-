import type { IssueType } from '@/db/schema';
import { ISSUE_LABELS, SEVERITY_LABELS, type Severity } from '@/lib/constants';
import { formatDateTime, formatQuantity } from '@/lib/format';
import { isSupplyTeam } from '@/lib/permissions';

/** What the "new case" alert shows. Plain data, so the template can be unit-tested without a database. */
export interface NewCaseEmailData {
  caseId: string;
  caseCode: string | null;
  issueType: IssueType;
  severity: Severity | null;
  tileCode: string | null;
  tileLabel: string | null;
  description: string | null;
  requestedColor: string | null;
  requestedSize: string | null;
  requestedFinish: string | null;
  requiredQuantity: string | null;
  availableQuantity: string | null;
  unit: string | null;
  alternativeTileText: string | null;
  notes: string | null;
  reporterName: string;
  reporterTeam: string | null;
  createdAt: Date;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Comma/semicolon/space separated list -> trimmed, de-duplicated, lowercased addresses that look like emails. */
export function parseRecipients(raw: string | undefined): string[] {
  if (!raw) return [];
  const all = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
  return [...new Set(all)];
}

/**
 * Who gets a new-case alert: the fixed list (CASE_ALERT_EMAILS) plus every active Supply-team member
 * with an email on their profile. De-duplicated, so nobody gets the same alert twice.
 */
export function alertRecipients(
  fixedRaw: string | undefined,
  members: { email: string | null; team: string | null; active: boolean }[],
): string[] {
  const team = members.filter((m) => m.active && isSupplyTeam(m.team) && m.email).map((m) => m.email!);
  return parseRecipients([fixedRaw ?? '', ...team].join(','));
}

export function buildNewCaseEmail(d: NewCaseEmailData, appUrl?: string) {
  const code = d.caseCode ?? 'New case';
  const issue = ISSUE_LABELS[d.issueType];
  const severity = d.severity ? SEVERITY_LABELS[d.severity] : null;
  const tile = [d.tileCode, d.tileLabel].filter(Boolean).join(' · ') || null;
  const reporter = d.reporterTeam ? `${d.reporterName} (${d.reporterTeam})` : d.reporterName;
  const link = appUrl ? `${appUrl.replace(/\/+$/, '')}/cases/${d.caseId}` : null;

  const subject = `${severity === 'Critical' || severity === 'High' ? `[${severity}] ` : ''}${code}: ${issue}${tile ? ` · ${tile}` : ''}`;

  const rows: [string, string | null][] = [
    ['Issue', issue],
    ['Severity', severity],
    ['Tile', tile],
    ['Reported by', reporter],
    ['Reported at', formatDateTime(d.createdAt)],
    ['Colour wanted', d.requestedColor],
    ['Size wanted', d.requestedSize],
    ['Finish wanted', d.requestedFinish],
    ['Required', formatQuantity(d.requiredQuantity, d.unit)],
    ['Available', formatQuantity(d.availableQuantity, d.unit)],
    ['Alternative offered', d.alternativeTileText],
    ['Description', d.description],
    ['Notes', d.notes],
  ];
  const filled = rows.filter((r): r is [string, string] => !!r[1]);

  const text = [
    `New critical case ${code}`,
    '',
    ...filled.map(([k, v]) => `${k}: ${v}`),
    ...(link ? ['', `Open the case: ${link}`] : []),
  ].join('\n');

  const cell = 'padding:6px 12px 6px 0;vertical-align:top;font-size:14px;';
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#111">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#666">New critical case</p>
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(code)}: ${escapeHtml(issue)}</h1>
<table style="border-collapse:collapse;width:100%">${filled
    .map(
      ([k, v]) =>
        `<tr><td style="${cell}color:#666;white-space:nowrap">${escapeHtml(k)}</td><td style="${cell}white-space:pre-wrap">${escapeHtml(v)}</td></tr>`,
    )
    .join('')}</table>
${link ? `<p style="margin:24px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px">Open the case</a></p>` : ''}
</div></body></html>`;

  return { subject, html, text };
}
