import { api, unwrap } from '@/api/client';
import type {
  Job,
  JobDetailsResponse,
  JobFile,
  JobPayload,
  JobsListResponse,
  PaginatedResponse,
  Run,
  RunStatus,
  ShareToken,
} from '@/api/types';

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
    unwrap(api.get<JobDetailsResponse>(`/jobs/${jobId}`)),

  create: (payload: JobPayload) => unwrap(api.post<Job>('/jobs', payload)),

  update: (jobId: string, payload: Partial<JobPayload>) =>
    unwrap(api.patch<Job>(`/jobs/${jobId}`, payload)),

  delete: async (jobId: string): Promise<void> => {
    await api.delete(`/jobs/${jobId}`);
  },

  clone: (jobId: string) => unwrap(api.post<Job>(`/jobs/${jobId}/clone`)),

  listRuns: (jobId: string, params?: { limit?: number; offset?: number }) =>
    unwrap(api.get<Run[]>(`/jobs/${jobId}/runs`, { params })),

  listShareTokens: (jobId: string) =>
    unwrap(api.get<ShareToken[]>(`/jobs/${jobId}/share-tokens`)),

  createShareToken: (jobId: string, payload: CreateShareTokenPayload) =>
    unwrap(api.post<ShareToken>(`/jobs/${jobId}/share-tokens`, payload)),

  listFiles: (jobId: string) =>
    unwrap(api.get<PaginatedResponse<JobFile>>(`/jobs/${jobId}/files`)),

  saveFileContent: (
    jobId: string,
    payload: {
      relative_path: string;
      content: string;
      mime_type?: string;
      is_executable?: boolean;
    },
  ) => unwrap(api.put<JobFile>(`/jobs/${jobId}/files/content`, payload)),

  getFileContent: (jobId: string, relativePath: string) =>
    unwrap(
      api.get<string>(`/jobs/${jobId}/files/content`, {
        params: { relativePath },
        responseType: 'text',
      }),
    ),

  uploadFile: (
    jobId: string,
    file: File,
    relativePath: string,
    isExecutable = false,
  ) => {
    const formData = new FormData();
    formData.append('file', file);

    return unwrap(
      api.post<JobFile>(`/jobs/${jobId}/files/upload`, formData, {
        params: {
          relativePath,
          isExecutable: isExecutable ? 'true' : 'false',
        },
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }),
    );
  },

  deleteFile: async (jobId: string, relativePath: string): Promise<void> => {
    await api.delete(`/jobs/${jobId}/files`, {
      params: {
        relativePath,
      },
    });
  },
};
