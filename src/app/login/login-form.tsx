'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginAction, type LoginState } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState | undefined, FormData>(loginAction, undefined);

  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Sign in with your username and password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              defaultValue={state?.username}
              aria-invalid={!!state?.fieldErrors?.username}
              required
            />
            {state?.fieldErrors?.username && <p className="text-sm text-destructive">{state.fieldErrors.username[0]}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!state?.fieldErrors?.password}
              required
            />
            {state?.fieldErrors?.password && <p className="text-sm text-destructive">{state.fieldErrors.password[0]}</p>}
          </div>
          {state?.error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="w-full">
            {pending && <Loader2 className="animate-spin" />}
            Login
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            First time here?{' '}
            <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
              Create an account
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">Forgot your password? Ask an admin to reset it.</p>
        </form>
      </CardContent>
    </Card>
  );
}
