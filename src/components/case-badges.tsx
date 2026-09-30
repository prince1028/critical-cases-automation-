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

export function IssueLabel({ issue }: { issue: string }) {
  return <span>{ISSUE_LABELS[issue as IssueType] ?? issue}</span>;
}

export function SourceBadge({ source }: { source: string }) {
  if (source !== 'WHATSAPP_HISTORICAL') return null;
  return (
    <Badge variant="outline" className="text-muted-foreground" title="Imported from the WhatsApp history">
      WhatsApp history
    </Badge>
  );
}
