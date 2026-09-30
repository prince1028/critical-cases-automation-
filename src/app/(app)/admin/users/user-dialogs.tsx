'use client';

import { Copy, KeyRound, Loader2, Pencil, UserPlus } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ROLE_LABELS } from '@/lib/constants';
import { createUserAction, resetPasswordAction, updateUserAction, type AdminUserState } from './actions';

type Role = keyof typeof ROLE_LABELS;

interface EditableUser {
  id: string;
  name: string;
  username: string | null;
  team: string | null;
  role: Role;
  active: boolean;
}

function Err({ errors }: { errors?: string[] }) {
  return errors?.length ? <p className="text-sm text-destructive">{errors[0]}</p> : null;
}

function UserFields({ state, user, teams, isSelf }: { state?: AdminUserState; user?: EditableUser; teams: string[]; isSelf?: boolean }) {
  const fe = state?.fieldErrors ?? {};
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="u-name">Full name</Label>
        <Input id="u-name" name="name" defaultValue={user?.name} aria-invalid={!!fe.name} autoFocus />
        <Err errors={fe.name} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="u-username">Username</Label>
        <Input
          id="u-username"
          name="username"
          defaultValue={user?.username ?? ''}
          autoCapitalize="none"
          spellCheck={false}
          placeholder="e.g. praduman"
          aria-invalid={!!fe.username}
        />
        <p className="text-xs text-muted-foreground">Letters, numbers, dot, dash or underscore. Not case-sensitive.</p>
        <Err errors={fe.username} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="u-team">Team</Label>
          <Input id="u-team" name="team" list="admin-team-options" defaultValue={user?.team ?? ''} placeholder="e.g. Sales or Supply" aria-invalid={!!fe.team} />
          <datalist id="admin-team-options">
            {teams.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <Err errors={fe.team} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="u-role">Role</Label>
          <Select name="role" defaultValue={user?.role ?? 'SALES'} disabled={isSelf}>
            <SelectTrigger id="u-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* A disabled Select doesn't submit; keep the value for your own account. */}
          {isSelf && <input type="hidden" name="role" value={user?.role} />}
          <Err errors={fe.role} />
        </div>
      </div>
      <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        <strong>Sales</strong>: report and track own cases. <strong>Manager</strong>: also view all cases.{' '}
        <strong>Admin</strong>: everything, including this page. A team containing <strong>Supply</strong> can resolve and close cases.
      </p>
    </div>
  );
}

function TempPasswordView({ username, password, onDone }: { username: string; password: string; onDone: () => void }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Username: ${username}\nPassword: ${password}`);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed; select the text instead');
    }
  };
  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Login ready</DialogTitle>
        <DialogDescription>Give these to the employee. The password is shown only once; they must change it at first login.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1 rounded-md border bg-muted/50 p-3 font-mono text-sm" data-testid="temp-credentials">
        <div>
          Username: <strong>{username}</strong>
        </div>
        <div>
          Password: <strong data-testid="temp-password">{password}</strong>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={copy}>
          <Copy /> Copy
        </Button>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}

export function CreateUserButton({ teams }: { teams: string[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AdminUserState | undefined, FormData>(createUserAction, undefined);
  const [shown, setShown] = useState<{ username: string; password: string } | null>(null);

  useEffect(() => {
    if (state?.ok && state.tempPassword && state.username) setShown({ username: state.username, password: state.tempPassword });
    else if (state?.error) toast.error(state.error);
  }, [state]);

  const close = () => {
    setOpen(false);
    setShown(null);
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <UserPlus /> Add user
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : !pending && close())}>
        <DialogContent>
          {shown ? (
            <TempPasswordView username={shown.username} password={shown.password} onDone={close} />
          ) : (
            <form action={action} className="grid gap-4" noValidate>
              <DialogHeader>
                <DialogTitle>Add user</DialogTitle>
                <DialogDescription>A temporary password is generated for them.</DialogDescription>
              </DialogHeader>
              <UserFields state={state} teams={teams} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" />} Create login
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EditUserButton({ user, teams, isSelf }: { user: EditableUser; teams: string[]; isSelf: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AdminUserState | undefined, FormData>(updateUserAction, undefined);

  useEffect(() => {
    if (state?.ok) {
      toast.success(`Saved ${user.name}`);
      setOpen(false);
    } else if (state?.error) toast.error(state.error);
  }, [state, user.name]);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Edit ${user.name}`}>
        <Pencil /> Edit
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <form action={action} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>Edit {user.name}</DialogTitle>
              <DialogDescription>
                {user.username ? 'Change their role, team or details.' : 'Give them a username, then use “Reset password” to create their first password.'}
              </DialogDescription>
            </DialogHeader>
            <input type="hidden" name="userId" value={user.id} />
            <UserFields state={state} user={user} teams={teams} isSelf={isSelf} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={user.active} disabled={isSelf} className="size-4" />
              Active (can log in)
            </label>
            {isSelf && <input type="hidden" name="active" value="on" />}
            {state?.error && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />} Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ResetPasswordButton({ userId, name, username }: { userId: string; name: string; username: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AdminUserState | undefined, FormData>(resetPasswordAction, undefined);
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (state?.ok && state.tempPassword) setShown(state.tempPassword);
    else if (state?.error) toast.error(state.error);
  }, [state]);

  const close = () => {
    setOpen(false);
    setShown(null);
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Reset password for ${name}`}>
        <KeyRound /> Reset
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : !pending && close())}>
        <DialogContent>
          {shown ? (
            <TempPasswordView username={username} password={shown} onDone={close} />
          ) : (
            <form action={action} className="grid gap-4">
              <DialogHeader>
                <DialogTitle>Reset password for {name}?</DialogTitle>
                <DialogDescription>
                  They’ll be signed out everywhere and get a new temporary password, which they must change at next login.
                </DialogDescription>
              </DialogHeader>
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="username" value={username} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" />} Reset password
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
