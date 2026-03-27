import type { Container, ExecutionLanguage, JobTemplate } from '@/api/types';
import type { JobFormValues } from '@/features/jobs/job-form/job-form-schema';

export type FormContainer = JobFormValues['containers'][number];

export function defaultEntrypoint(language: ExecutionLanguage): string {
  return language === 'javascript'
    ? 'node /workspace/code/index.js'
    : 'python3 /workspace/code/main.py';
}

export function makeBootstrapContainer(language: ExecutionLanguage): FormContainer {
  return {
    name: 'bootstrap',
    image: language === 'javascript' ? 'node:20-alpine' : 'python:3.11-slim',
    is_parent: true,
    env: [],
    resources: {
      cpu_limit: '',
      memory_limit: '',
      gpus: '',
      shm_size: '',
    },
  };
}

export function mapApiContainerToFormContainer(container: Container): FormContainer {
  return {
    name: container.name ?? '',
    image: container.image ?? '',
    is_parent: Boolean(container.is_parent),
    env: Object.entries(container.env || {}).map(([key, value]) => ({
      key,
      value: String(value ?? ''),
    })),
    resources: {
      cpu_limit:
        container.resources?.cpu_limit !== undefined ? String(container.resources.cpu_limit) : '',
      memory_limit: container.resources?.memory_limit ?? '',
      gpus: container.resources?.gpus ?? '',
      shm_size: container.resources?.shm_size ?? '',
    },
  };
}

export function normalizeFormContainers(
  containers: FormContainer[] | undefined,
  language: ExecutionLanguage,
): FormContainer[] {
  const list = Array.isArray(containers)
    ? containers.map((container) => ({
        ...container,
        env: container.env ?? [],
        resources: {
          cpu_limit: container.resources?.cpu_limit ?? '',
          memory_limit: container.resources?.memory_limit ?? '',
          gpus: container.resources?.gpus ?? '',
          shm_size: container.resources?.shm_size ?? '',
        },
      }))
    : [];

  if (list.length === 0) {
    return [makeBootstrapContainer(language)];
  }

  const parentIndex = list.findIndex((item) => item.is_parent);

  if (parentIndex === -1) {
    return [
      { ...list[0], is_parent: true },
      ...list.slice(1).map((item) => ({ ...item, is_parent: false })),
    ];
  }

  return list.map((item, index) => ({
    ...item,
    is_parent: index === parentIndex,
  }));
}

export function normalizePayloadContainers(
  containers:
    | Array<{
        name: string;
        image: string;
        is_parent?: boolean;
        env?: Record<string, string>;
        resources?: {
          cpu_limit?: number;
          memory_limit?: string;
          gpus?: string;
          shm_size?: string;
        };
      }>
    | undefined,
  language: ExecutionLanguage,
) {
  const list = Array.isArray(containers) ? [...containers] : [];

  if (list.length === 0) {
    return [
      {
        name: 'bootstrap',
        image: language === 'javascript' ? 'node:20-alpine' : 'python:3.11-slim',
        is_parent: true,
        env: {},
        resources: {},
      },
    ];
  }

  const parentIndex = list.findIndex((item) => item.is_parent);

  if (parentIndex === -1) {
    return list.map((item, index) => ({
      ...item,
      is_parent: index === 0,
    }));
  }

  return list.map((item, index) => ({
    ...item,
    is_parent: index === parentIndex,
  }));
}

export function mapTemplateToFormValues(
  template: JobTemplate,
  currentValues: JobFormValues,
): JobFormValues {
  const draft = template.draft || {
    execution_language: 'python' as ExecutionLanguage,
    execution_code: '',
    entrypoint: '',
    environments: {},
    containers: [],
    title: '',
    description: '',
    attached_files: [],
  };

  const nextLanguage = draft.execution_language ?? 'python';
  const templateContainers = (draft.containers || []).map(mapApiContainerToFormContainer);

  return {
    ...currentValues,
    title: draft.title || template.name || currentValues.title,
    description: draft.description || template.description || '',
    execution_language: nextLanguage,
    execution_code: draft.execution_code ?? '',
    entrypoint: draft.entrypoint || defaultEntrypoint(nextLanguage),
    environments: Object.entries(draft.environments || {}).map(([key, value]) => ({
      key,
      value: String(value ?? ''),
    })),
    containers: normalizeFormContainers(templateContainers, nextLanguage),
    attached_files: currentValues.attached_files,
  };
}