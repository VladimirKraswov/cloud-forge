import { api, unwrap } from '@/api/client';
import type { Job, JobPayload, JobsListResponse, Run, RunStatus, ShareToken } from '@/api/types';

export interface JobsListParams {
  search?: string;
  status?: RunStatus;
  limit?: number;
  offset?: number;
}

export interface CreateShareTokenPayload {
  expires_at?: string;
  expires_in_seconds?: number;
  max_claims?: number;
}

export const jobsApi = {
  list: (params?: JobsListParams) =>
    unwrap(api.get<JobsListResponse>('/jobs', { params })),

  get: (jobId: string) =>
    unwrap(api.get<Job>(`/jobs/${jobId}`)),

  create: (payload: JobPayload) =>
    unwrap(api.post<Job>('/jobs', payload)),

  update: (jobId: string, payload: Partial<JobPayload>) =>
    unwrap(api.patch<Job>(`/jobs/${jobId}`, payload)),

  delete: async (jobId: string): Promise<void> => {
    await api.delete(`/jobs/${jobId}`);
  },

  clone: (jobId: string) =>
    unwrap(api.post<Job>(`/jobs/${jobId}/clone`)),

  listRuns: (jobId: string, params?: { limit?: number; offset?: number }) =>
    unwrap(api.get<Run[]>(`/jobs/${jobId}/runs`, { params })),

  listShareTokens: (jobId: string) =>
    unwrap(api.get<ShareToken[]>(`/jobs/${jobId}/share-tokens`)),

  createShareToken: (jobId: string, payload: CreateShareTokenPayload) =>
    unwrap(api.post<ShareToken>(`/jobs/${jobId}/share-tokens`, payload)),
};