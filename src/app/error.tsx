'use client';

import { Button } from '@/components/ui/button';

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-3 px-4 text-center" role="alert">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">Please try again. If it keeps happening, the database may be unreachable.</p>
      {error.digest && <p className="font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>}
      <Button onClick={reset} className="mx-auto">Try again</Button>
    </main>
  );
}
