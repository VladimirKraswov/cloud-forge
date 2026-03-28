import { api, unwrap } from '@/api/client';
import type { PaginatedResponse, Run, RunEvent, RunsListResponse, RunStatus } from '@/api/types';

export interface ListRunsFilters {
  search?: string;
  status?: RunStatus;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export const runsApi = {
  list: (filters: ListRunsFilters) => unwrap(api.get<RunsListResponse>('/api/runs', { params: filters })),

  get: (runId: string) => unwrap(api.get<Run>(`/api/runs/${runId}`)),

  getEvents: (runId: string) =>
    unwrap(api.get<PaginatedResponse<RunEvent>>(`/api/runs/${runId}/events`)),

  cancel: (runId: string, reason?: string) =>
    unwrap(
      api.post<{ ok?: boolean; final?: boolean }>(`/api/runs/${runId}/cancel`, {
        reason,
      }),
    ),

  delete: (runId: string) => unwrap(api.delete(`/api/runs/${runId}`)),
};
