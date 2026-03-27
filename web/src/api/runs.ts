import { api, unwrap } from '@/api/client';
import type { PaginatedResponse, Run, RunEvent } from '@/api/types';

export const runsApi = {
  get: (runId: string) => unwrap(api.get<Run>(`/api/runs/${runId}`)),

  getEvents: (runId: string) =>
    unwrap(api.get<PaginatedResponse<RunEvent>>(`/api/runs/${runId}/events`)),

  cancel: (runId: string, reason?: string) =>
    unwrap(
      api.post<{ ok?: boolean; final?: boolean }>(`/api/runs/${runId}/cancel`, {
        reason,
      }),
    ),
};
