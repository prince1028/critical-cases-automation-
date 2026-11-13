import { AnalyticsDashboard } from '@/app/(app)/admin/analytics/analytics-dashboard';

/**
 * The MVP landing page. It renders the same component as /admin/analytics - the original analytics
 * route is kept so the previous version can be restored; there is only one dashboard implementation.
 */
export default function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <AnalyticsDashboard searchParams={searchParams} />;
}