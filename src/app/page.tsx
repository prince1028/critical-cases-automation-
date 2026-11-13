import { redirect } from 'next/navigation';
import { ANALYTICS_MVP, ANALYTICS_ROUTE, LEGACY_DASHBOARD_ROUTE } from '@/lib/mvp';

/**
 * TEMPORARY (Analytics MVP): while the MVP is on the app opens straight into Analytics. With
 * ANALYTICS_MVP=false this returns to sending people to the operational Dashboard.
 */
export default function Home() {
  redirect(ANALYTICS_MVP ? ANALYTICS_ROUTE : LEGACY_DASHBOARD_ROUTE);
}