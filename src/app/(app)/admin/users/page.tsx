import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ROLE_LABELS } from '@/lib/constants';
import { requireAdmin } from '@/lib/dal';
import { formatDateTime } from '@/lib/format';
import { canManageCases, isSupplyTeam } from '@/lib/permissions';
import { listTeams, listUsersForAdmin } from '@/server/users';
import { CreateUserButton, EditUserButton, ResetPasswordButton } from './user-dialogs';

export const metadata: Metadata = { title: 'Users' };

function LoginStatus({ u }: { u: Awaited<ReturnType<typeof listUsersForAdmin>>[number] }) {
  if (!u.active) return <Badge variant="outline">Deactivated</Badge>;
  if (!u.hasPassword) return <Badge variant="outline" className="text-amber-700">No login yet</Badge>;
  if (u.lockedUntil && u.lockedUntil > new Date()) return <Badge variant="destructive">Locked</Badge>;
  if (u.mustChangePassword) return <Badge variant="secondary">Temporary password</Badge>;
  return <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Active</Badge>;
}

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  const [rows, teams] = await Promise.all([listUsersForAdmin(), listTeams()]);
  const suggestions = [...new Set(['Sales', 'Supply', ...teams])];

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users & roles</h1>
          <p className="text-sm text-muted-foreground">
            Give employees a login, a role and a team. Anyone in a team with “Supply” in its name can resolve and close cases, and
            gets an email for every new case once their email is set.
          </p>
        </div>
        <CreateUserButton teams={suggestions} />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Login</TableHead>
              <TableHead className="text-right">Cases</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id} className={u.active ? undefined : 'opacity-60'}>
                <TableCell className="font-medium">
                  {u.name}
                  {u.id === admin.id && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                  {u.email && <div className="text-xs font-normal text-muted-foreground">{u.email}</div>}
                </TableCell>
                <TableCell className="font-mono text-sm">{u.username ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {u.team ?? <span className="text-muted-foreground">—</span>}
                    {canManageCases({ role: u.role, team: u.team }) && (
                      <Badge variant="outline" className="text-xs" title="Can start, resolve, close and reopen cases">
                        Case handler
                      </Badge>
                    )}
                    {u.active && isSupplyTeam(u.team) && (
                      <Badge
                        variant="outline"
                        className={u.email ? 'text-xs' : 'text-xs text-amber-700'}
                        title={u.email ? 'Gets an email for every new case' : 'Add an email (Edit) so they get new-case alerts'}
                      >
                        {u.email ? 'Gets alerts' : 'No email: no alerts'}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                <TableCell>
                  <LoginStatus u={u} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{u.casesReported}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <EditUserButton user={u} teams={suggestions} isSelf={u.id === admin.id} />
                    {u.username && u.active && <ResetPasswordButton userId={u.id} name={u.name} username={u.username} />}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
