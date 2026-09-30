import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Button asChild className="mx-auto">
        <Link href="/dashboard">Go to dashboard</Link>
      </Button>
    </main>
  );
}
