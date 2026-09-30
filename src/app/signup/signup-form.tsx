'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PASSWORD_MIN } from '@/lib/validation';
import { signupAction, type SignupState } from './actions';

export function SignupForm({ teams }: { teams: string[] }) {
  const [state, action, pending] = useActionState<SignupState | undefined, FormData>(signupAction, undefined);
  const fe = state?.fieldErrors ?? {};

  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  const err = (k: string) => (fe[k]?.length ? <p className="text-sm text-destructive">{fe[k]![0]}</p> : null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>First time here? Set up your login in under a minute.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" autoComplete="name" defaultValue={state?.values?.name} aria-invalid={!!fe.name} />
            {err('name')}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="e.g. praduman"
              defaultValue={state?.values?.username}
              aria-invalid={!!fe.username}
            />
            {!fe.username && <p className="text-xs text-muted-foreground">Letters, numbers, dot, dash or underscore.</p>}
            {err('username')}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="team">Team</Label>
            <Input
              id="team"
              name="team"
              list="signup-team-options"
              placeholder="e.g. Sales"
              defaultValue={state?.values?.team}
              aria-invalid={!!fe.team}
            />
            <datalist id="signup-team-options">
              {teams.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            {err('team')}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" aria-invalid={!!fe.password} />
            {!fe.password && (
              <p className="text-xs text-muted-foreground">At least {PASSWORD_MIN} characters, with a letter and a number.</p>
            )}
            {err('password')}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!fe.confirmPassword}
            />
            {err('confirmPassword')}
          </div>
          {state?.error && !Object.keys(fe).length && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="w-full">
            {pending && <Loader2 className="animate-spin" />}
            Create account
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
              Log in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
