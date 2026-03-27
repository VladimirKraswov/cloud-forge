import { api, unwrap } from '@/api/client';
import type { ContainerPreset, JobTemplate, PaginatedResponse } from '@/api/types';

export const catalogApi = {
  listTemplates: () => unwrap(api.get<PaginatedResponse<JobTemplate>>('/catalog/job-templates')),
  getTemplate: (templateId: string) => unwrap(api.get<JobTemplate>(`/catalog/job-templates/${templateId}`)),
  listContainerPresets: () => unwrap(api.get<PaginatedResponse<ContainerPreset>>('/catalog/container-presets')),
};
