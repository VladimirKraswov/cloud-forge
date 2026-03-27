import { z } from 'zod';

export const keyValueSchema = z.object({
  key: z.string().default(''),
  value: z.string().default(''),
});

export const resourceSchema = z.object({
  cpu_limit: z.string().default(''),
  memory_limit: z.string().default(''),
  gpus: z.string().default(''),
  shm_size: z.string().default(''),
});

export const jobFormSchema = z.object({
  title: z.string().min(3, 'Title must contain at least 3 characters'),
  description: z.string().optional(),
  bootstrap_image_id: z.string().min(1, 'Choose a bootstrap image'),
  entrypoint: z.string().min(1, 'Entrypoint is required'),
  entrypoint_args_text: z.string().default(''),
  working_dir: z.string().default('/workspace'),
  environment_variables: z.array(keyValueSchema).default([]),
  resources: resourceSchema.default({
    cpu_limit: '',
    memory_limit: '',
    gpus: '',
    shm_size: '',
  }),
});

export type JobFormValues = z.infer<typeof jobFormSchema>;
