'use client';

import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto grid max-w-md gap-3 py-16 text-center" role="alert">
      <AlertTriangle className="mx-auto size-8 text-destructive" />
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        We couldn’t load this page, most likely because the database couldn’t be reached. Your data is safe; please try again.
      </p>
      {error.digest && <p className="font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>}
      <Button onClick={reset} className="mx-auto">
        <RotateCw /> Try again
      </Button>
    </div>
  );
}
