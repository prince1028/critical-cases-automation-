import { ArrowLeft, History, MessageSquareText, PlusCircle, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SourceBadge, StatusBadge } from '@/components/case-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { IssueType } from '@/db/schema';
import { ISSUE_LABELS, SEVERITY_LABELS, STATUS_LABELS, type Severity } from '@/lib/constants';
import { canManageCases, requireUser } from '@/lib/dal';
import { allowedActions } from '@/lib/permissions';
import type { CaseStatus } from '@/db/schema';
import { formatDate, formatDateTime, formatQuantity, formatRelative } from '@/lib/format';
import { getCaseForUser } from '@/server/cases';
import { CreatedToast } from './created-toast';
import { StatusActions } from './status-actions';

export const metadata: Metadata = { title: 'Case' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm">{children ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

const EVENT_TEXT: Record<string, string> = {
  HISTORICAL_IMPORT: 'Imported from the WhatsApp critical-supply group history',
  CREATED: 'Case reported',
  UPDATED: 'Case updated',
  STATUS_CHANGED: 'Status changed',
  ASSIGNED: 'Case assigned',
  COMMENT: 'Comment',
};

function eventTitle(e: { eventType: string; oldValue: unknown; newValue: unknown }) {
  if (e.eventType === 'STATUS_CHANGED') {
    const from = (e.oldValue as { status?: CaseStatus } | null)?.status;
    const to = (e.newValue as { status?: CaseStatus } | null)?.status;
    if (from && to) return `Status: ${STATUS_LABELS[from]} → ${STATUS_LABELS[to]}`;
  }
  return EVENT_TEXT[e.eventType] ?? e.eventType;
}

export default async function CasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const data = await getCaseForUser(id, user);
  if (!data) notFound(); // missing, or another salesperson's case
  const { case: c, tile, linkedTiles, events } = data;
  const justCreated = (await searchParams).created === '1';
  const canManage = canManageCases(user);

  const issues = [c.issueType, ...(c.secondaryIssueTypes ?? [])].map((i) => ISSUE_LABELS[i as IssueType] ?? i);
  const required = formatQuantity(c.requiredQuantity, c.unit) ?? c.requiredQuantityText;
  const available = formatQuantity(c.availableQuantity, c.unit) ?? c.availableQuantityText;
  const reporter = data.reporterName ?? c.reportedByName;

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      {justCreated && <CreatedToast caseCode={c.caseCode} />}

      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/cases">
            <ArrowLeft /> Back to {canManage ? 'Cases' : 'My Cases'}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Critical Case <span className="font-mono">#{c.caseCode ?? '—'}</span>
          </h1>
          <StatusBadge status={c.status} className="text-sm" />
          <SourceBadge source={c.source} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Reported {c.source === 'APP' ? formatRelative(c.createdAt) : formatDate(c.reportedOn ?? c.createdAt)}
          {reporter ? ` by ${reporter}` : ''}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <dl className="grid gap-5 sm:grid-cols-2">
            <Field label="Tile">
              {tile ? (
                <span>
                  <span className="font-mono font-semibold">{tile.tileCode}</span>
                  {tile.name && <span className="text-muted-foreground"> · {tile.name}</span>}
                </span>
              ) : c.requestedTileName ? (
                <span>
                  {c.requestedTileName} <span className="text-muted-foreground">(no tile record)</span>
                </span>
              ) : (
                <span className="text-muted-foreground">No tile</span>
              )}
              {linkedTiles.length > 1 && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  Also: {linkedTiles.filter((t) => t.id !== tile?.id).map((t) => t.tileCode).join(', ')}
                </span>
              )}
            </Field>
            <Field label="Issue">{issues.join(', ')}</Field>
            <Field label="Date">{formatDate(c.reportedOn ?? c.createdAt)}</Field>
            <Field label="Severity">{c.severity ? SEVERITY_LABELS[c.severity as Severity] : null}</Field>
            <Field label="Required quantity">{required}</Field>
            <Field label="Available quantity">{available}</Field>
            {(c.requestedColor || c.requestedSize || c.requestedFinish) && (
              <Field label="Requested">
                {[c.requestedColor && `Colour: ${c.requestedColor}`, c.requestedSize && `Size: ${c.requestedSize}`, c.requestedFinish && `Finish: ${c.requestedFinish}`]
                  .filter(Boolean)
                  .join(' · ')}
              </Field>
            )}
            <Field label="Alternative tile">{c.alternativeTileText}</Field>
            <Field label="Alternative accepted">
              {c.alternativeAccepted === null ? (c.alternativeAcceptedText ?? null) : c.alternativeAccepted ? 'Yes' : 'No'}
            </Field>
            {data.assigneeName && <Field label="Handled by">{data.assigneeName}</Field>}
            {c.resolvedAt && <Field label="Resolved on">{formatDateTime(c.resolvedAt)}</Field>}
          </dl>
          <div className="mt-6 grid gap-5">
            <Field label="Customer requirement / description">
              {c.description ? <p className="whitespace-pre-wrap">{c.description}</p> : null}
            </Field>
            {c.resolution && (
              <Field label="Resolution">
                <p className="whitespace-pre-wrap">{c.resolution}</p>
              </Field>
            )}
          </div>
        </CardContent>
      </Card>

      {canManage && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" /> Case handling
            </CardTitle>
          </CardHeader>
          <CardContent>
            {c.source === 'APP' ? (
              <StatusActions caseId={c.id} status={c.status} actions={allowedActions(c.status)} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Historical WhatsApp cases are kept exactly as imported and can’t be changed here.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" /> Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ol className="relative grid gap-5 border-l pl-5">
              {events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute top-1 -left-[1.6rem] flex size-3 rounded-full border-2 border-background bg-primary" />
                  <div className="flex flex-wrap items-center gap-x-2 text-sm">
                    {e.eventType === 'CREATED' ? <PlusCircle className="size-4 text-primary" /> : null}
                    <span className="font-medium">{eventTitle(e)}</span>
                    {e.userName && <span className="text-muted-foreground">by {e.userName}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</p>
                  {e.comment && e.eventType !== 'HISTORICAL_IMPORT' && (
                    <p className="mt-1 flex gap-1.5 rounded-md bg-muted px-2 py-1.5 text-sm">
                      <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /> {e.comment}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {c.source === 'WHATSAPP_HISTORICAL' && c.sourceMessages && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Original WhatsApp messages</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{c.sourceMessages}</pre>
          </CardContent>
        </Card>
      )}

      <div>
        <Button asChild variant="outline">
          <Link href="/cases">
            <ArrowLeft /> Back to My Cases
          </Link>
        </Button>
      </div>
    </div>
  );
}
