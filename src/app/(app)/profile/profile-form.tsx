'use client';

import { Loader2 } from 'lucide-react';
import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateProfileAction, type ProfileState } from './actions';

export function ProfileForm({ email }: { email: string | null }) {
  const [state, action, pending] = useActionState<ProfileState | undefined, FormData>(updateProfileAction, undefined);
  useEffect(() => {
    if (state?.ok) toast.success('Email saved');
    else if (state?.error) toast.error(state.error);
  }, [state]);
  const err = state?.fieldErrors?.email?.[0];

  return (
    <form action={action} className="grid gap-3" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={email ?? ''}
          placeholder="name@florzy.com"
          aria-invalid={!!err}
        />
        {err ? <p className="text-sm text-destructive">{err}</p> : <p className="text-xs text-muted-foreground">Leave empty to remove it.</p>}
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto sm:justify-self-start">
        {pending && <Loader2 className="animate-spin" />} Save email
      </Button>
    </form>
  );
}
