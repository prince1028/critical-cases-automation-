import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/dal';
import { AuthShell } from '@/components/auth-shell';
import { ChangePasswordForm } from './change-password-form';

export const metadata: Metadata = { title: 'Change password' };

export default async function ChangePasswordPage() {
  const user = await requireUser({ allowPasswordChangePending: true });
  return (
    <AuthShell
      title={user.mustChangePassword ? 'Set your password' : 'Change password'}
      subtitle={
        user.mustChangePassword
          ? `Welcome, ${user.name}. Replace your temporary password before continuing.`
          : `Signed in as ${user.username}.`
      }
    >
      <ChangePasswordForm />
      {!user.mustChangePassword && (
        <p className="mt-4 text-center text-sm">
          <Link href="/dashboard" className="text-muted-foreground underline-offset-4 hover:underline">
            Back to dashboard
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
