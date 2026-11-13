import { redirect } from 'next/navigation';
import { ANALYTICS_MVP, ANALYTICS_ROUTE } from '@/lib/mvp';
import DashboardView from './dashboard-view';

/**
 * The old operational dashboard, kept intact in ./dashboard-view.tsx.
 *
 * TEMPORARY (Analytics MVP): it is hidden from the navigation, so this page only redirects to
 * Analytics, the app's single product area. Restoring it is deleting the redirect line below.
 */
export default function DashboardPage() {
  if (ANALYTICS_MVP) redirect(ANALYTICS_ROUTE);
  return <DashboardView />;
}