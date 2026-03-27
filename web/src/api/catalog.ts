import { api, unwrap } from '@/api/client';
import type { ContainerPreset, JobTemplate, PaginatedResponse } from '@/api/types';

export const catalogApi = {
  listTemplates: () => unwrap(api.get<PaginatedResponse<JobTemplate>>('/catalog/job-templates')),
  getTemplate: (templateId: string) => unwrap(api.get<JobTemplate>(`/catalog/job-templates/${templateId}`)),
  listContainerPresets: () => unwrap(api.get<PaginatedResponse<ContainerPreset>>('/catalog/container-presets')),

  previewDockerfile: (data: { baseImage: string; extraPackages: string }) =>
    unwrap(api.post<{ dockerfile: string }>('/api/bootstrap-images/preview', data)),

  buildBootstrapImage: (data: {
    name: string;
    baseImage: string;
    tag: string;
    extraPackages: string;
    dockerUser: string;
    dockerPass: string;
  }) => unwrap(api.post<{ id: string; status: string }>('/api/bootstrap-images/build', data)),

  getBuildProgress: (id: string) =>
    unwrap(api.get<{ status: string; logs: string[] }>(`/api/bootstrap-images/build/${id}`)),
};
