import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="mx-auto grid max-w-3xl gap-5" aria-busy="true" aria-label="Loading case">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-64" />
      <Skeleton className="h-40" />
    </div>
  );
}
