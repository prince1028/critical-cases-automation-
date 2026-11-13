import { AnalyticsDashboard } from './analytics-dashboard';

/**
 * The original analytics route, kept intact so the pre-MVP version can be restored. It renders the
 * exact same dashboard as /analytics - the implementation lives in analytics-dashboard.tsx and is
 * not duplicated.
 */
export default function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <AnalyticsDashboard searchParams={searchParams} />;
}