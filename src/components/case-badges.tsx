import { Badge } from '@/components/ui/badge';
import type { CaseStatus, IssueType } from '@/db/schema';
import { ISSUE_LABELS, STATUS_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<CaseStatus, string> = {
  NEW: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  IN_PROGRESS: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  RESOLVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  CANCELLED: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

export function StatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn('border-transparent font-medium', STATUS_STYLES[status], className)}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

/** The main problem, plus "+N" when the case has more. */
export function IssueLabel({ issue, more }: { issue: string; more?: number }) {
  return (
    <span>
      {ISSUE_LABELS[issue as IssueType] ?? issue}
      {more ? <span className="ml-1 text-xs text-muted-foreground">+{more}</span> : null}
    </span>
  );
}

export function SourceBadge({ source }: { source: string }) {
  if (source !== 'WHATSAPP_HISTORICAL') return null;
  return (
    <Badge variant="outline" className="text-muted-foreground" title="Imported from the WhatsApp history">
      WhatsApp history
    </Badge>
  );
}

/** Listing state for a case whose tile wasn't in the system. Nothing for cases that don't need listing. */
export function ListingBadge({ listingRequired, listedAt }: { listingRequired: boolean; listedAt: Date | string | null }) {
  if (!listingRequired) return null;
  return listedAt ? (
    <Badge variant="secondary" className="border-transparent bg-emerald-100 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
      Listed 👍
    </Badge>
  ) : (
    <Badge variant="secondary" className="border-transparent bg-violet-100 font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-200" title="Tile is not in the system yet">
      Needs listing
    </Badge>
  );
}
