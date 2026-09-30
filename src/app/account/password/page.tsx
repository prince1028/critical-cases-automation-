import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/dal';
import { ChangePasswordForm } from './change-password-form';

export const metadata: Metadata = { title: 'Change password' };

export default async function ChangePasswordPage() {
  const user = await requireUser({ allowPasswordChangePending: true });
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {user.mustChangePassword ? 'Set your password' : 'Change password'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {user.mustChangePassword
              ? `Welcome, ${user.name}. Replace your temporary password before continuing.`
              : `Signed in as ${user.username}.`}
          </p>
        </div>
        <ChangePasswordForm />
        {!user.mustChangePassword && (
          <p className="mt-4 text-center text-sm">
            <Link href="/dashboard" className="text-muted-foreground underline-offset-4 hover:underline">
              Back to dashboard
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
