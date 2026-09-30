'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function Pagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const href = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p === 1) next.delete('page');
    else next.set('page', String(p));
    return `${pathname}${next.size ? `?${next}` : ''}`;
  };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav className="flex items-center justify-between gap-2" aria-label="Pagination">
      <p className="text-sm text-muted-foreground">
        {from}–{to} of {total}
      </p>
      <div className="flex gap-2">
        <Button asChild={page > 1} variant="outline" size="sm" disabled={page <= 1}>
          {page > 1 ? (
            <Link href={href(page - 1)}>
              <ChevronLeft /> Previous
            </Link>
          ) : (
            <span>
              <ChevronLeft /> Previous
            </span>
          )}
        </Button>
        <Button asChild={page < pages} variant="outline" size="sm" disabled={page >= pages}>
          {page < pages ? (
            <Link href={href(page + 1)}>
              Next <ChevronRight />
            </Link>
          ) : (
            <span>
              Next <ChevronRight />
            </span>
          )}
        </Button>
      </div>
    </nav>
  );
}
