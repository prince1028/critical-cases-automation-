import Link from 'next/link';
import { IssueLabel, SourceBadge, StatusBadge } from '@/components/case-badges';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import type { CaseListItem } from '@/server/cases';

function TileCell({ c }: { c: CaseListItem }) {
  if (c.tileCode) {
    return (
      <div className="min-w-0">
        <div className="font-mono text-sm">{c.tileCode}</div>
        {c.tileLabel && <div className="truncate text-xs text-muted-foreground">{c.tileLabel}</div>}
      </div>
    );
  }
  return <span className="text-sm text-muted-foreground">{c.tileLabel ? c.tileLabel : 'No tile'}</span>;
}

export function CasesTable({ cases, showReporter = false }: { cases: CaseListItem[]; showReporter?: boolean }) {
  return (
    <>
      {/* Cards on small screens */}
      <ul className="grid gap-2 md:hidden">
        {cases.map((c) => (
          <li key={c.id}>
            <Link href={`/cases/${c.id}`} className="block rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold">{c.caseCode ?? '—'}</span>
                <StatusBadge status={c.status} />
              </div>
              <div className="mt-1 text-sm font-medium">
                <IssueLabel issue={c.issueType} />
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">{c.tileCode ?? c.tileLabel ?? 'No tile'}</span>
                <span className="shrink-0">{formatDate(c.createdAt)}</span>
              </div>
              {showReporter && c.reportedByName && <div className="mt-1 text-xs text-muted-foreground">{c.reportedByName}</div>}
            </Link>
          </li>
        ))}
      </ul>

      {/* Table on larger screens */}
      <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Case Code</TableHead>
              <TableHead>Tile</TableHead>
              <TableHead>Issue</TableHead>
              {showReporter && <TableHead>Reported by</TableHead>}
              <TableHead className="w-32">Date</TableHead>
              <TableHead className="w-32">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.map((c) => (
              <TableRow key={c.id} className="relative">
                <TableCell className="font-mono font-medium">
                  <Link href={`/cases/${c.id}`} className="after:absolute after:inset-0 hover:underline">
                    {c.caseCode ?? '—'}
                  </Link>
                </TableCell>
                <TableCell className="max-w-64">
                  <TileCell c={c} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <IssueLabel issue={c.issueType} />
                    <SourceBadge source={c.source} />
                  </div>
                </TableCell>
                {showReporter && <TableCell className="text-sm text-muted-foreground">{c.reportedByName ?? '—'}</TableCell>}
                <TableCell className="text-sm text-muted-foreground">{formatDate(c.createdAt)}</TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
