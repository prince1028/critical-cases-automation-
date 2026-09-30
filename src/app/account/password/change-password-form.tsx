'use client';

import { Loader2 } from 'lucide-react';
import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PASSWORD_MIN } from '@/lib/validation';
import { changePasswordAction, type ChangePasswordState } from './actions';

const FIELDS = [
  { name: 'currentPassword', label: 'Current (or temporary) password', autoComplete: 'current-password' },
  { name: 'newPassword', label: 'New password', autoComplete: 'new-password', hint: `At least ${PASSWORD_MIN} characters, with a letter and a number.` },
  { name: 'confirmPassword', label: 'Confirm new password', autoComplete: 'new-password' },
] as const;

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<ChangePasswordState | undefined, FormData>(changePasswordAction, undefined);
  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={action} className="grid gap-4" noValidate>
          {FIELDS.map((f) => (
            <div key={f.name} className="grid gap-2">
              <Label htmlFor={f.name}>{f.label}</Label>
              <Input id={f.name} name={f.name} type="password" autoComplete={f.autoComplete} aria-invalid={!!state?.fieldErrors?.[f.name]} required />
              {'hint' in f && !state?.fieldErrors?.[f.name] && <p className="text-xs text-muted-foreground">{f.hint}</p>}
              {state?.fieldErrors?.[f.name] && <p className="text-sm text-destructive">{state.fieldErrors[f.name]![0]}</p>}
            </div>
          ))}
          {state?.error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="w-full">
            {pending && <Loader2 className="animate-spin" />}
            Save password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
