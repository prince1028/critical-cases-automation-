'use client';

import { Loader2, ThumbsUp } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { markListedAction } from './actions';

/** The Listing team's thumbs up once the missing tile is listed in the system. */
export function ListingActions({ caseId }: { caseId: string }) {
  const [pending, start] = useTransition();

  // Toast from the handler, not an effect: on success this card disappears with the page refresh.
  const submit = (fd: FormData) =>
    start(async () => {
      const r = await markListedAction(undefined, fd);
      if (r.ok) toast.success(r.message ?? 'Marked as listed');
      else toast.error(r.error ?? 'Could not save');
    });

  return (
    <form action={submit} className="grid gap-3">
      <input type="hidden" name="caseId" value={caseId} />
      <div className="grid gap-2">
        <Label htmlFor="listing-note">Note (optional)</Label>
        <Input id="listing-note" name="note" maxLength={2000} placeholder="e.g. Listed as tile code 9931, Crystal Black 600x600" />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <ThumbsUp />}
          Item listed
        </Button>
      </div>
    </form>
  );
}
