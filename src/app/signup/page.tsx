import type { Metadata } from 'next';
import { connection } from 'next/server';
import { isSupplyTeam } from '@/lib/permissions';
import { listTeams } from '@/server/users';
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
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img src="/florzy-logo.png" alt="Florzy" width={48} height={48} className="mx-auto mb-3 size-12 rounded-xl" />
          <h1 className="text-2xl font-semibold tracking-tight">Florzy</h1>
          <p className="text-sm text-muted-foreground">Critical Case Management</p>
        </div>
        <SignupForm teams={[...new Set(['Sales', ...teams])]} />
      </div>
    </main>
  );
}
