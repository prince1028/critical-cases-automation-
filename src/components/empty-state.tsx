import { Inbox, Plus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function EmptyState({
  title = 'No critical cases yet.',
  description,
  showCta = true,
}: {
  title?: string;
  description?: string;
  showCta?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
      <Inbox className="size-8 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-medium">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {showCta && (
        <Button asChild>
          <Link href="/cases/new">
            <Plus /> Report Your First Case
          </Link>
        </Button>
      )}
    </div>
  );
}
