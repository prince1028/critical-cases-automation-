import { AppHeader } from '@/components/app-header';
import { getViewer } from '@/lib/dal';
import { ANALYTICS_MVP, visibleNav } from '@/lib/mvp';
import { unreadCount } from '@/server/notifications';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Used for the header only; every page and action also checks the user itself.
  // TEMPORARY (Analytics MVP): getViewer falls back to the read-only analytics viewer while
  // the auth bypass is on; requireUser() would still redirect to /login. See src/lib/mvp.ts.
  const user = await getViewer();
  const unread = await unreadCount(user.id).catch(() => 0); // the bell is optional; never block the page
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <AppHeader
        user={{ name: user.name, role: user.role, team: user.team }}
        unread={unread}
        mvp={ANALYTICS_MVP}
        // Resolved on the server: a client bundle would inline process.env at build time, so the
        // flag could not be switched off without rebuilding.
        nav={visibleNav(user.role === 'ADMIN')}
      />
      {/* Bottom padding clears the phone tab bar (and the iPhone home indicator). */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-8 md:pb-10">
        {children}
      </main>
    </div>
  );
}