import { ArrowLeft, History, ImageIcon, MessageSquareText, MessagesSquare, PlusCircle, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ListingBadge, SourceBadge, StatusBadge } from '@/components/case-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { IssueType } from '@/db/schema';
import { ISSUE_LABELS, SEVERITY_LABELS, STATUS_LABELS, type Severity } from '@/lib/constants';
import { canManageCases, requireUser } from '@/lib/dal';
import { allowedActions, awaitingListing, canAddPhotos, canMarkListed, canPostMessages, statusActionsFor, type StatusAction } from '@/lib/permissions';
import { MAX_CASE_PHOTOS, MAX_PHOTOS } from '@/lib/photos';
import type { CaseStatus } from '@/db/schema';
import { formatDate, formatDateTime, formatQuantity, formatRelative } from '@/lib/format';
import { after } from 'next/server';
import { getCaseForUser, MAX_MESSAGE_LENGTH } from '@/server/cases';
import { markNotificationsRead } from '@/server/notifications';
import { AddPhotos } from './add-photos';
import { CaseMessages, type CaseMessage } from './case-messages';
import { ListingActions } from './listing-actions';
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

const ACTION_TAGS: Record<StatusAction, string> = {
  START: 'Started working',
  RESOLVE: 'Resolved',
  CLOSE: 'Closed',
  REOPEN: 'Reopened',
};

const isListedEvent = (e: { eventType: string; newValue: unknown }) =>
  e.eventType === 'UPDATED' && (e.newValue as { listed?: boolean } | null)?.listed === true;

function eventTitle(e: { eventType: string; oldValue: unknown; newValue: unknown }) {
  const added = (e.newValue as { photos_added?: number } | null)?.photos_added;
  if (isListedEvent(e)) return 'Item listed 👍';
  if (e.eventType === 'UPDATED' && added) return `${added} photo${added === 1 ? '' : 's'} added`;
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
  const { case: c, tile, linkedTiles, events, photos } = data;
  const justCreated = (await searchParams).created === '1';
  // Seeing the case counts as reading its notifications.
  after(() => markNotificationsRead(user.id, id).catch((e) => console.error('mark read failed', e)));
  const canManage = canManageCases(user);
  const canPost = canPostMessages(user, c);
  const statusActions = statusActionsFor(user, c);
  // The reporter (not Supply) sees a small "close it yourself" card instead of full case handling.
  const reporterClose = !canManage && statusActions.length > 0;
  // ...or, while a missing tile isn't listed yet, why they can't close it.
  const reporterWaiting =
    !canManage && c.source === 'APP' && c.reportedBy === user.id && awaitingListing(c) && allowedActions(c.status).includes('CLOSE');
  const showListing = c.source === 'APP' && awaitingListing(c) && canMarkListed(user);
  // The conversation: messages, plus the notes people wrote with the report and with each status change.
  const messages: CaseMessage[] = events
    .filter((e) => (e.comment || isListedEvent(e)) && e.eventType !== 'HISTORICAL_IMPORT')
    .map((e) => {
      const action = (e.newValue as { action?: StatusAction } | null)?.action;
      const tag =
        e.eventType === 'CREATED'
          ? 'Note with the report'
          : e.eventType === 'STATUS_CHANGED'
            ? ((action && ACTION_TAGS[action]) ?? 'Status changed')
            : isListedEvent(e)
              ? 'Item listed 👍'
              : undefined;
      const text = e.comment ?? 'The item is now listed in the system.';
      return { id: e.id, text, userId: e.userId, userName: e.userName, userTeam: e.userTeam, createdAt: e.createdAt.toISOString(), tag };
    });
  const history = events.filter((e) => e.eventType !== 'COMMENT');
  const photoRoom = canAddPhotos(user, c) ? Math.min(MAX_PHOTOS, MAX_CASE_PHOTOS - photos.length) : 0;

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
          <ListingBadge listingRequired={c.listingRequired} listedAt={c.listedAt} />
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
                  {/* The item sheet's name (snapshot on the case) wins over the old WhatsApp-era tile record. */}
                  {(c.requestedTileNo ? c.requestedTileName : tile.name) && (
                    <span className="text-muted-foreground"> · {c.requestedTileNo ? c.requestedTileName : tile.name}</span>
                  )}
                </span>
              ) : c.requestedTileNo ? (
                <span>
                  <span className="font-mono font-semibold">{c.requestedTileNo}</span>
                  {c.requestedTileName && <span className="text-muted-foreground"> · {c.requestedTileName}</span>}
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
            {(c.tileColor || c.tileSize || c.tileFinish || c.tileBody) && (
              <Field label="Tile details">
                {[c.tileColor, c.tileSize, c.tileFinish, c.tileBody].filter(Boolean).join(' · ')}
                {c.tileVendor && <span className="mt-0.5 block text-xs text-muted-foreground">{c.tileVendor}</span>}
              </Field>
            )}
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

      {(photos.length > 0 || canAddPhotos(user, c)) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="size-4" /> Photos{photos.length > 0 && ` (${photos.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {photos.length === 0 && <p className="mb-3 text-sm text-muted-foreground">No photos yet.</p>}
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photos.map((p, i) => (
                <li key={p.id}>
                  <a
                    href={`/api/attachments/${p.id}`}
                    target="_blank"
                    rel="noopener"
                    className="block aspect-square overflow-hidden rounded-md border bg-muted transition-opacity hover:opacity-90"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- private photo served by our own route */}
                    <img src={`/api/attachments/${p.id}`} alt={p.fileName ?? `Photo ${i + 1}`} loading="lazy" className="size-full object-cover" />
                  </a>
                </li>
              ))}
            </ul>
            {photos.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Tap a photo to open it full size.</p>}
            {photoRoom > 0 && (
              <div className={photos.length ? 'mt-4 border-t pt-4' : ''}>
                <AddPhotos caseId={c.id} max={photoRoom} />
              </div>
            )}
            {canAddPhotos(user, c) && photoRoom === 0 && (
              <p className="mt-3 text-xs text-muted-foreground">This case has {MAX_CASE_PHOTOS} photos, the most it can hold.</p>
            )}
          </CardContent>
        </Card>
      )}

      {showListing && (
        <Card className="border-violet-300 dark:border-violet-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" /> Listing
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              This tile isn’t in the system. List it, then give the thumbs up so the salesperson can go ahead.
            </p>
            <ListingActions caseId={c.id} />
          </CardContent>
        </Card>
      )}

      {reporterWaiting && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" /> Close this case
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Waiting for the Listing team: this tile isn’t in the system yet. You can close the case once they mark it as listed.
            </p>
          </CardContent>
        </Card>
      )}

      {reporterClose && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" /> Close this case
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              No longer needed, or sorted out with the customer? Close it yourself; the Supply team sees your reason.
            </p>
            <StatusActions caseId={c.id} status={c.status} actions={statusActions} />
          </CardContent>
        </Card>
      )}

      {canManage && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" /> Case handling
            </CardTitle>
          </CardHeader>
          <CardContent>
            {c.source === 'APP' ? (
              <StatusActions caseId={c.id} status={c.status} actions={statusActions} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Historical WhatsApp cases are kept exactly as imported and can’t be changed here.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {(canPost || messages.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessagesSquare className="size-4" /> Messages{messages.length > 0 && ` (${messages.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CaseMessages caseId={c.id} messages={messages} meId={user.id} canPost={canPost} maxLength={MAX_MESSAGE_LENGTH} />
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
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ol className="relative grid gap-5 border-l pl-5">
              {history.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute top-1 -left-[1.6rem] flex size-3 rounded-full border-2 border-background bg-primary" />
                  <div className="flex flex-wrap items-center gap-x-2 text-sm">
                    {e.eventType === 'CREATED' ? <PlusCircle className="size-4 text-primary" /> : null}
                    <span className="font-medium">{eventTitle(e)}</span>
                    {e.userName && <span className="text-muted-foreground">by {e.userName}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</p>
                  {e.comment && e.eventType !== 'HISTORICAL_IMPORT' && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageSquareText className="size-3" /> Note in Messages
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
