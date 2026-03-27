import { z } from 'zod';

export const keyValueSchema = z.object({
  key: z.string().default(''),
  value: z.string().default(''),
});

export const resourceSchema = z.object({
  cpu_limit: z.string().optional(),
  memory_limit: z.string().optional(),
  gpus: z.string().optional(),
  shm_size: z.string().optional(),
});

export const containerFormSchema = z.object({
  name: z.string().min(1, 'Container name is required'),
  image: z.string().min(1, 'Container image is required'),
  is_parent: z.boolean().default(false),
  env: z.array(keyValueSchema).default([]),
  resources: resourceSchema.default({}),
});

export const attachedFileSchema = z.object({
  id: z.string(),
  filename: z.string(),
  size_bytes: z.number(),
  storage_key: z.string(),
  mime_type: z.string(),
});

export const jobFormSchema = z.object({
  title: z.string().min(3, 'Title must contain at least 3 characters'),
  description: z.string().optional(),
  execution_language: z.enum(['python', 'javascript']),
  execution_code: z.string().min(1, 'Execution code is required'),
  entrypoint: z.string().optional(),
  environments: z.array(keyValueSchema).default([]),
  containers: z
    .array(containerFormSchema)
    .min(1, 'At least one container is required')
    .refine(
      (containers) => containers.filter((container) => container.is_parent).length === 1,
      'Exactly one bootstrap container is required',
    ),
  attached_files: z.array(attachedFileSchema).default([]),
});

export type JobFormValues = z.infer<typeof jobFormSchema>;