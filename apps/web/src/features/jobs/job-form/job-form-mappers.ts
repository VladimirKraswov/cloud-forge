import type { Job, JobPayload } from '@/api/types';
import type { JobFormValues } from '@/features/jobs/job-form/job-form-schema';
import { compactObject, fromKeyValuePairs, toKeyValuePairs } from '@/shared/utils/object';

function splitArgs(value?: string | null): string[] {
  if (!value?.trim()) return [];
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function mapJobToFormValues(
  job?: Job | null,
  bootstrapImageId?: string | null,
): JobFormValues {
  return {
    title: job?.title ?? '',
    description: job?.description ?? '',
    bootstrap_image_id: job?.bootstrap_image_id ?? bootstrapImageId ?? '',
    entrypoint: job?.entrypoint ?? 'scripts/run.sh',
    entrypoint_args_text: (job?.entrypoint_args ?? []).join(' '),
    working_dir: job?.working_dir ?? '/workspace',
    environment_variables: toKeyValuePairs(job?.environment_variables ?? {}),
    resources: {
      cpu_limit: job?.resources?.cpu_limit != null ? String(job.resources.cpu_limit) : '',
      memory_limit: job?.resources?.memory_limit ?? '',
      gpus: job?.resources?.gpus ?? '',
      shm_size: job?.resources?.shm_size ?? '',
    },
  };
}

export function mapFormValuesToPayload(values: JobFormValues): JobPayload {
  return {
    title: values.title.trim(),
    description: values.description?.trim() || null,
    bootstrap_image_id: values.bootstrap_image_id,
    entrypoint: values.entrypoint.trim(),
    entrypoint_args: splitArgs(values.entrypoint_args_text),
    working_dir: values.working_dir?.trim() || '/workspace',
    environment_variables: fromKeyValuePairs(values.environment_variables),
    resources: compactObject({
      cpu_limit: values.resources.cpu_limit.trim()
        ? Number(values.resources.cpu_limit.trim())
        : undefined,
      memory_limit: values.resources.memory_limit.trim() || undefined,
      gpus: values.resources.gpus.trim() || undefined,
      shm_size: values.resources.shm_size.trim() || undefined,
    }),
  };
}
