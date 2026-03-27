import type { AttachedFile, Container, Job } from '@/api/types';
import type { JobFormValues } from '@/features/jobs/job-form/job-form-schema';
import { compactObject, fromKeyValuePairs, toKeyValuePairs } from '@/shared/utils/object';

function defaultEntrypoint(
  language: JobFormValues['execution_language'],
): string {
  return language === 'javascript'
    ? 'node /workspace/code/index.js'
    : 'python3 /workspace/code/main.py';
}

function makeBootstrapContainer(
  language: JobFormValues['execution_language'],
): JobFormValues['containers'][number] {
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

function normalizeFormContainers(
  containers: JobFormValues['containers'],
  language: JobFormValues['execution_language'],
): JobFormValues['containers'] {
  if (!containers.length) {
    return [makeBootstrapContainer(language)];
  }

  const parentIndex = containers.findIndex((container) => container.is_parent);

  if (parentIndex === -1) {
    return containers.map((container, index) => ({
      ...container,
      is_parent: index === 0,
    }));
  }

  return containers.map((container, index) => ({
    ...container,
    is_parent: index === parentIndex,
  }));
}

export function mapJobToFormValues(job?: Job | null): JobFormValues {
  const executionLanguage = job?.execution_language ?? 'python';

  const mappedContainers: JobFormValues['containers'] = (job?.containers ?? []).map((container) => ({
    name: container.name ?? '',
    image: container.image ?? '',
    is_parent: Boolean(container.is_parent),
    env: toKeyValuePairs(container.env ?? {}),
    resources: {
      cpu_limit: container.resources?.cpu_limit?.toString() ?? '',
      memory_limit: container.resources?.memory_limit ?? '',
      gpus: container.resources?.gpus ?? '',
      shm_size: container.resources?.shm_size ?? '',
    },
  }));

  return {
    title: job?.title ?? '',
    description: job?.description ?? '',
    execution_language: executionLanguage,
    execution_code: job?.execution_code ?? '',
    entrypoint: job?.entrypoint ?? defaultEntrypoint(executionLanguage),
    environments: toKeyValuePairs(job?.environments ?? {}),
    containers: normalizeFormContainers(mappedContainers, executionLanguage),
    attached_files: job?.attached_files ?? [],
  };
}

export function mapFormValuesToPayload(values: JobFormValues) {
  const parentIndex = values.containers.findIndex((container) => container.is_parent);

  const normalizedContainers = values.containers.map((container, index) => ({
    ...container,
    is_parent: index === (parentIndex === -1 ? 0 : parentIndex),
  }));

  const containers: Container[] = normalizedContainers.map((container) => ({
    name: container.name.trim(),
    image: container.image.trim(),
    is_parent: container.is_parent,
    env: fromKeyValuePairs(container.env),
    resources: compactObject({
      cpu_limit:
        container.resources.cpu_limit && container.resources.cpu_limit.trim().length
          ? Number(container.resources.cpu_limit)
          : undefined,
      memory_limit: container.resources.memory_limit,
      gpus: container.resources.gpus,
      shm_size: container.resources.shm_size,
    }),
  }));

  return {
    title: values.title.trim(),
    description: values.description?.trim() || null,
    execution_language: values.execution_language,
    execution_code: values.execution_code,
    entrypoint: values.entrypoint?.trim() || null,
    environments: fromKeyValuePairs(values.environments),
    containers,
    attached_files: values.attached_files as AttachedFile[],
  };
}