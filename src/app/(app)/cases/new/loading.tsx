import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="mx-auto grid max-w-2xl gap-4" aria-busy="true" aria-label="Loading form">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-36" />
      <Skeleton className="h-48" />
    </div>
  );
}
