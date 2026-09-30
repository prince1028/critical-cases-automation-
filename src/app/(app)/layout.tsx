import { AppHeader } from '@/components/app-header';
import { requireUser } from '@/lib/dal';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Used for the header only; every page and action also checks the user itself.
  const user = await requireUser();
  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <AppHeader user={{ name: user.name, role: user.role, team: user.team }} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
