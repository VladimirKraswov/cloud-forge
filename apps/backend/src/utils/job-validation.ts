import path from 'path';
import { ExecutionLanguage, RuntimeResources } from '../models/job';

export interface CreateJobPayload {
  title: string;
  description?: string | null;
  owner_id?: string | null;
  bootstrap_image_id: string;
  execution_language: ExecutionLanguage;
  environment_variables: Record<string, string>;
  resources?: RuntimeResources | null;
  entrypoint: string;
  entrypoint_args: string[];
  working_dir?: string | null;
}

export interface JobValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalized?: CreateJobPayload;
}

export class JobValidationError extends Error {
  details: string[];

  constructor(message: string, details: string[]) {
    super(message);
    this.name = 'JobValidationError';
    this.details = details;
  }
}

const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const GPU_VALUE_RE = /^(all|\d+(,\d+)*)$/;
const SIZE_RE = /^\d+(b|kb|mb|gb|tb|k|m|g|t)$/i;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeRelativePath = (value: string): string => {
  const normalized = path.posix.normalize(value.replace(/\\/g, '/')).replace(/^\/+/, '');
  if (
    !normalized ||
    normalized === '.' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw new Error(`invalid relative path "${value}"`);
  }
  return normalized;
};

const normalizeWorkingDir = (value: string): string => {
  const normalized = value.replace(/\\/g, '/').trim();
  if (!normalized) {
    throw new Error('working_dir must not be empty');
  }

  if (normalized.startsWith('/')) {
    if (!normalized.startsWith('/workspace')) {
      throw new Error('working_dir absolute path must stay under /workspace');
    }
    return normalized.replace(/\/+$/, '') || '/workspace';
  }

  return `/workspace/${normalizeRelativePath(normalized)}`;
};

const normalizeResources = (
  resourcesValue: unknown,
  errors: string[],
): RuntimeResources | null | undefined => {
  if (resourcesValue == null) return undefined;
  if (!isPlainObject(resourcesValue)) {
    errors.push('resources must be an object');
    return undefined;
  }

  const gpus = resourcesValue.gpus == null ? undefined : String(resourcesValue.gpus).trim();
  const shmSize =
    resourcesValue.shm_size == null ? undefined : String(resourcesValue.shm_size).trim();
  const cpuLimit = resourcesValue.cpu_limit == null ? undefined : Number(resourcesValue.cpu_limit);
  const memoryLimit =
    resourcesValue.memory_limit == null ? undefined : String(resourcesValue.memory_limit).trim();

  if (gpus && !GPU_VALUE_RE.test(gpus)) {
    errors.push('resources.gpus must be "all" or comma-separated ids');
  }

  if (shmSize && !SIZE_RE.test(shmSize)) {
    errors.push('resources.shm_size has invalid size format');
  }

  if (memoryLimit && !SIZE_RE.test(memoryLimit)) {
    errors.push('resources.memory_limit has invalid size format');
  }

  if (cpuLimit != null && (!Number.isFinite(cpuLimit) || cpuLimit <= 0)) {
    errors.push('resources.cpu_limit must be a positive number');
  }

  return {
    gpus,
    shm_size: shmSize,
    cpu_limit: cpuLimit,
    memory_limit: memoryLimit,
  };
};

const inferExecutionLanguage = (rawValue: string | null, entrypointRaw: string | null): ExecutionLanguage => {
  if (rawValue === 'python' || rawValue === 'javascript') {
    return rawValue;
  }

  const lowerEntrypoint = (entrypointRaw || '').toLowerCase();
  if (
    lowerEntrypoint.endsWith('.js') ||
    lowerEntrypoint.endsWith('.mjs') ||
    lowerEntrypoint.endsWith('.cjs')
  ) {
    return 'javascript';
  }

  return 'python';
};

export const validateCreateJobPayload = (payload: unknown): JobValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isPlainObject(payload)) {
    return {
      valid: false,
      errors: ['payload must be an object'],
      warnings,
    };
  }

  const title = asString(payload.title);
  const description = payload.description == null ? null : asString(payload.description);
  const ownerId = payload.owner_id == null ? null : asString(payload.owner_id);
  const bootstrapImageId = asString(payload.bootstrap_image_id);
  const entrypointRaw = asString(payload.entrypoint);
  const workingDirRaw = payload.working_dir == null ? null : asString(payload.working_dir);
  const executionLanguageRaw = asString(payload.execution_language);
  const resources = normalizeResources(payload.resources, errors);

  if (!title) {
    errors.push('title is required');
  } else if (title.length > 200) {
    errors.push('title must be at most 200 characters');
  }

  if (!bootstrapImageId) {
    errors.push('bootstrap_image_id is required');
  }

  if (
    executionLanguageRaw != null &&
    executionLanguageRaw !== 'python' &&
    executionLanguageRaw !== 'javascript'
  ) {
    errors.push('execution_language must be "python" or "javascript"');
  }

  let entrypoint: string | null = null;
  if (!entrypointRaw) {
    errors.push('entrypoint is required');
  } else {
    try {
      entrypoint = normalizeRelativePath(entrypointRaw);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'entrypoint is invalid');
    }
  }

  const entrypointArgsRaw = payload.entrypoint_args;
  const entrypointArgs: string[] = [];

  if (entrypointArgsRaw != null) {
    if (!Array.isArray(entrypointArgsRaw)) {
      errors.push('entrypoint_args must be an array of strings');
    } else {
      for (const [index, arg] of entrypointArgsRaw.entries()) {
        if (typeof arg !== 'string') {
          errors.push(`entrypoint_args[${index}] must be a string`);
          continue;
        }
        entrypointArgs.push(arg);
      }
    }
  }

  let workingDir: string | null = '/workspace';
  if (workingDirRaw) {
    try {
      workingDir = normalizeWorkingDir(workingDirRaw);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'working_dir is invalid');
    }
  }

  const environmentVariablesRaw = payload.environment_variables;
  const environmentVariables: Record<string, string> = {};

  if (environmentVariablesRaw != null) {
    if (!isPlainObject(environmentVariablesRaw)) {
      errors.push('environment_variables must be an object');
    } else {
      for (const [key, value] of Object.entries(environmentVariablesRaw)) {
        if (!ENV_KEY_RE.test(key)) {
          errors.push(`environment_variables.${key} has invalid key format`);
          continue;
        }
        if (value == null) {
          errors.push(`environment_variables.${key} must not be null`);
          continue;
        }
        environmentVariables[key] = String(value);
      }
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
    };
  }

  return {
    valid: true,
    errors,
    warnings,
    normalized: {
      title: title!,
      description,
      owner_id: ownerId,
      bootstrap_image_id: bootstrapImageId!,
      execution_language: inferExecutionLanguage(executionLanguageRaw, entrypointRaw),
      environment_variables: environmentVariables,
      resources: resources ?? null,
      entrypoint: entrypoint!,
      entrypoint_args: entrypointArgs,
      working_dir: workingDir,
    },
  };
};

export const assertValidCreateJobPayload = (payload: unknown): CreateJobPayload => {
  const result = validateCreateJobPayload(payload);

  if (!result.valid || !result.normalized) {
    throw new JobValidationError('Job payload validation failed', result.errors);
  }

  return result.normalized;
};

export const assertValidRelativePath = (value: unknown, fieldName = 'relative_path'): string => {
  const raw = asString(value);

  if (!raw) {
    throw new JobValidationError('File path validation failed', [`${fieldName} is required`]);
  }

  try {
    return normalizeRelativePath(raw);
  } catch (err) {
    throw new JobValidationError('File path validation failed', [
      err instanceof Error ? err.message : `${fieldName} is invalid`,
    ]);
  }
};