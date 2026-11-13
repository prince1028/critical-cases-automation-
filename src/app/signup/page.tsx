import type { Metadata } from 'next';
import { connection } from 'next/server';
import { isSupplyTeam } from '@/lib/permissions';
import { listTeams } from '@/server/users';
import { AuthShell } from '@/components/auth-shell';
import { SignupForm } from './signup-form';

export const metadata: Metadata = { title: 'Create account' };

export default async function SignupPage() {
  await connection(); // render per request (team suggestions come from the database)
  let teams: string[] = [];
  try {
    teams = (await listTeams()).filter((t) => !isSupplyTeam(t));
  } catch (e) {
    console.error('listTeams failed', e); // suggestions are optional; the form still works
  }
  return (
    <AuthShell>
      <SignupForm teams={[...new Set(['Sales', ...teams])]} />
    </AuthShell>
  );
}
