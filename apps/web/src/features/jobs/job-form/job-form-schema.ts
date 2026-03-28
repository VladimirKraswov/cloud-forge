import { z } from 'zod';

export const keyValueSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const resourceSchema = z.object({
  cpu_limit: z.string(),
  memory_limit: z.string(),
  gpus: z.string(),
  shm_size: z.string(),
});

export const jobFormSchema = z.object({
  title: z.string().min(3, 'Title must contain at least 3 characters'),
  description: z.string().optional(),
  bootstrap_image_id: z.string().min(1, 'Choose a bootstrap image'),
  entrypoint: z.string().min(1, 'Entrypoint is required'),
  entrypoint_args_text: z.string(),
  working_dir: z.string(),
  environment_variables: z.array(keyValueSchema),
  resources: resourceSchema,
});

export type JobFormValues = z.infer<typeof jobFormSchema>;