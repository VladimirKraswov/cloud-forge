import { api, unwrap } from '@/api/client';
import type { DashboardSummary, RecentEvent, Run, Worker } from '@/api/types';

export const dashboardApi = {
  getSummary: () => unwrap(api.get<DashboardSummary>('/dashboard/summary')),
  getActiveRuns: () => unwrap(api.get<Run[]>('/dashboard/active-runs')),
  getActiveWorkers: () => unwrap(api.get<Worker[]>('/dashboard/active-workers')),
  getRecentEvents: () => unwrap(api.get<RecentEvent[]>('/dashboard/recent-events')),
};
