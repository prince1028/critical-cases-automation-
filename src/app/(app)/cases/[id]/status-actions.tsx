'use client';

import { CheckCircle2, Loader2, PlayCircle, RotateCcw, XCircle } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CaseStatus } from '@/db/schema';
import { STATUS_LABELS } from '@/lib/constants';
import { STATUS_ACTIONS, type StatusAction } from '@/lib/permissions';
import { updateStatusAction, type StatusActionState } from './actions';

const ICONS: Record<StatusAction, React.ComponentType<{ className?: string }>> = {
  START: PlayCircle,
  RESOLVE: CheckCircle2,
  CLOSE: XCircle,
  REOPEN: RotateCcw,
};

const VARIANTS: Record<StatusAction, 'default' | 'outline' | 'secondary'> = {
  START: 'secondary',
  RESOLVE: 'default',
  CLOSE: 'outline',
  REOPEN: 'outline',
};

export function StatusActions({ caseId, status, actions }: { caseId: string; status: CaseStatus; actions: StatusAction[] }) {
  const [open, setOpen] = useState<StatusAction | null>(null);
  const [state, formAction, pending] = useActionState<StatusActionState | undefined, FormData>(updateStatusAction, undefined);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message ?? 'Status updated');
      setOpen(null);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const def = open ? STATUS_ACTIONS[open] : null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => {
          const Icon = ICONS[a];
          return (
            <Button key={a} type="button" variant={VARIANTS[a]} onClick={() => setOpen(a)}>
              <Icon /> {STATUS_ACTIONS[a].label}
            </Button>
          );
        })}
      </div>

      <Dialog open={open !== null} onOpenChange={(o) => !o && !pending && setOpen(null)}>
        <DialogContent>
          {def && open && (
            <form action={formAction} className="grid gap-4" noValidate>
              <DialogHeader>
                <DialogTitle>{def.label}</DialogTitle>
                <DialogDescription>
                  {STATUS_LABELS[status]} → {STATUS_LABELS[def.to]}
                </DialogDescription>
              </DialogHeader>
              <input type="hidden" name="caseId" value={caseId} />
              <input type="hidden" name="action" value={open} />
              <div className="grid gap-2">
                <Label htmlFor="status-note">
                  {def.noteLabel}
                  {def.noteRequired && ' *'}
                </Label>
                <Textarea
                  id="status-note"
                  name="note"
                  rows={4}
                  required={def.noteRequired}
                  placeholder={open === 'RESOLVE' ? 'e.g. Sourced 120 sqft from Morbi, delivered on 5 Oct' : undefined}
                  autoFocus
                />
              </div>
              {state?.error && (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {state.error}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(null)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" />}
                  {def.label}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
