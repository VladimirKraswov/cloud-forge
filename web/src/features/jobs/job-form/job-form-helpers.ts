// src/features/jobs/job-form/job-form-helpers.ts
import type { Container, ExecutionLanguage, JobTemplate } from '@/api/types';
import type { JobFormValues } from './job-form-schema';

export type FormContainer = JobFormValues['containers'][number];

export function defaultEntrypoint(language: ExecutionLanguage): string {
  return language === 'javascript'
    ? 'node /workspace/code/index.js'
    : 'python3 /workspace/code/main.py';
}

function makeBootstrapContainer(language: JobFormValues['execution_language']): FormContainer {
  return {
    name: 'bootstrap',
    image: language === 'javascript' ? 'node:20-alpine' : 'python:3.11-slim',
    is_parent: true,
    env: [], // всегда массив
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
    name: (container.name ?? 'container').trim(),
    image: (container.image ?? '').trim(),
    is_parent: Boolean(container.is_parent),
    env: Object.entries(container.env || {}).map(([key, value]) => ({
      key: key.trim(),
      value: String(value ?? ''),
    })),
    resources: {
      cpu_limit: container.resources?.cpu_limit != null 
        ? String(container.resources.cpu_limit) 
        : '',
      memory_limit: container.resources?.memory_limit ?? '',
      gpus: container.resources?.gpus ?? '',
      shm_size: container.resources?.shm_size ?? '',
    },
  };
}

export function normalizeFormContainers(
  containers: FormContainer[] | Container[] | undefined,
  language: ExecutionLanguage,
): FormContainer[] {
  if (!Array.isArray(containers) || containers.length === 0) {
    return [makeBootstrapContainer(language)];
  }

  // Преобразуем в FormContainer
  let list: FormContainer[] = containers.map((item: any) => {
    if (item && Array.isArray(item.env)) {
      return item as FormContainer; // уже форма
    }
    return mapApiContainerToFormContainer(item as Container);
  });

  const parentIndex = list.findIndex((item) => item.is_parent);

  if (parentIndex === -1) {
    // Первый контейнер делаем bootstrap
    const first = list[0]!;
    list[0] = {
      name: first.name || 'bootstrap',
      image: first.image || (language === 'javascript' ? 'node:20-alpine' : 'python:3.11-slim'),
      is_parent: true,
      env: first.env || [],                    // ← гарантируем массив
      resources: first.resources || {
        cpu_limit: '',
        memory_limit: '',
        gpus: '',
        shm_size: '',
      },
    };
  } else {
    // Только один parent
    list = list.map((item, index) => ({
      name: item.name || `container-${index + 1}`,
      image: item.image || '',
      is_parent: index === parentIndex,
      env: item.env || [],                     // ← гарантируем массив
      resources: item.resources || {
        cpu_limit: '',
        memory_limit: '',
        gpus: '',
        shm_size: '',
      },
    }));
  }

  return list;
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

  return list.map((item, index) => ({
    ...item,
    is_parent: parentIndex === -1 ? index === 0 : index === parentIndex,
    env: item.env || {},
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
  const templateContainers = normalizeFormContainers(draft.containers, nextLanguage);

  return {
    ...currentValues,
    title: (draft.title || template.name || currentValues.title).trim(),
    description: draft.description || template.description || '',
    execution_language: nextLanguage,
    execution_code: draft.execution_code ?? '',
    entrypoint: draft.entrypoint || defaultEntrypoint(nextLanguage),
    environments: Object.entries(draft.environments || {}).map(([key, value]) => ({
      key: key.trim(),
      value: String(value ?? ''),
    })),
    containers: templateContainers,
    attached_files: currentValues.attached_files,
  };
}