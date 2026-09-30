import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="grid gap-5" aria-busy="true" aria-label="Loading cases">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10" />
      <div className="grid gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </div>
  );
}
