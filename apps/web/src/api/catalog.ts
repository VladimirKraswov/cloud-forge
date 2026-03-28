import { api, unwrap } from '@/api/client';
import type {
  BootstrapBuildProgress,
  BootstrapEnvironmentSpec,
  BootstrapImage,
  BootstrapImageLogEntry,
  ContainerPreset,
  JobTemplate,
  PaginatedResponse,
  RuntimeResources,
} from '@/api/types';

export const catalogApi = {
  listTemplates: () =>
    unwrap(api.get<PaginatedResponse<JobTemplate>>('/catalog/job-templates')),

  getTemplate: (templateId: string) =>
    unwrap(api.get<JobTemplate>(`/catalog/job-templates/${templateId}`)),

  listContainerPresets: () =>
    unwrap(api.get<PaginatedResponse<ContainerPreset>>('/catalog/container-presets')),

  listBootstrapImages: () =>
    unwrap(api.get<PaginatedResponse<BootstrapImage>>('/api/bootstrap-images')),

  getBootstrapImage: (imageId: string) =>
    unwrap(api.get<BootstrapImage>(`/api/bootstrap-images/${imageId}`)),

  getBootstrapImageLogs: (imageId: string) =>
    unwrap(
      api.get<PaginatedResponse<BootstrapImageLogEntry>>(
        `/api/bootstrap-images/${imageId}/logs`,
      ),
    ),

  previewDockerfile: (data: {
    baseImage: string;
    environments: BootstrapEnvironmentSpec[];
    dockerfileOverride?: string | null;
  }) =>
    unwrap(
      api.post<{
        dockerfile: string;
        environments: Array<{ name: string; python_binary: string }>;
      }>('/api/bootstrap-images/preview', data),
    ),

  buildBootstrapImage: (data: {
    name: string;
    baseImage: string;
    tag: string;
    environments: BootstrapEnvironmentSpec[];
    dockerfileText?: string;
    runtimeResources?: RuntimeResources | null;
    dockerUser: string;
    dockerPass: string;
  }) =>
    unwrap(
      api.post<{ id: string; status: string; dockerfile_text: string }>(
        '/api/bootstrap-images/build',
        data,
      ),
    ),

  getBuildProgress: (id: string) =>
    unwrap(api.get<BootstrapBuildProgress>(`/api/bootstrap-images/build/${id}`)),

  cancelBuild: (id: string) =>
    unwrap(api.post<{ success: boolean }>(`/api/bootstrap-images/build/${id}/cancel`)),
};
