import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function CaseNotFound() {
  return (
    <div className="mx-auto grid max-w-md gap-3 py-16 text-center">
      <h1 className="text-xl font-semibold">Case not found</h1>
      <p className="text-sm text-muted-foreground">It doesn’t exist, or it belongs to another salesperson.</p>
      <Button asChild className="mx-auto">
        <Link href="/cases">Back to My Cases</Link>
      </Button>
    </div>
  );
}
