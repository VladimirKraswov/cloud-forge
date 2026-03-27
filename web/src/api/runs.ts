import { api, unwrap } from '@/api/client';
import type { Run } from '@/api/types';

export const runsApi = {
  get: (runId: string) => unwrap(api.get<Run>(`/api/runs/${runId}`)),
  cancel: (runId: string, reason?: string) => unwrap(api.post<{ ok?: boolean; final?: boolean }>(`/api/runs/${runId}/cancel`, { reason })),
};
