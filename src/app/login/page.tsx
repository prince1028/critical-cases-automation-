import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Login' };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            F
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Florzy</h1>
          <p className="text-sm text-muted-foreground">Critical Case Management</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
