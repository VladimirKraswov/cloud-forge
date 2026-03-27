import { api, unwrap } from '@/api/client';
import type { AttachedFile } from '@/api/types';

export const artifactsApi = {
  uploadJobFile: async (jobId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    return unwrap(
      api.post<AttachedFile>('/artifacts/upload-job', formData, {
        params: { jobId },
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    );
  },
};
