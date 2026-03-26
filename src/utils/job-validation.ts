import { AttachedFile, Container, ExecutionLanguage } from '../models/job';

export interface CreateJobPayload {
  title: string;
  description?: string | null;
  owner_id?: string | null;
  containers: Container[];
  environments: Record<string, string>;
  attached_files: AttachedFile[];
  execution_code: string;
  execution_language: ExecutionLanguage;
  entrypoint?: string | null;
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

const VALID_EXECUTION_LANGUAGES = new Set<ExecutionLanguage>(['python', 'javascript']);
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

const isKnownJavascriptBootstrapImage = (image: string): boolean => {
  const normalized = image.toLowerCase();

  return (
    normalized.includes('node') ||
    normalized.includes('cloud-forge-worker') ||
    normalized.includes('cloudforge/worker')
  );
};

const normalizeContainer = (
  value: unknown,
  index: number,
  errors: string[],
): Container | null => {
  if (!isPlainObject(value)) {
    errors.push(`containers[${index}] must be an object`);
    return null;
  }

  const name = asString(value.name);
  const image = asString(value.image);

  if (!name) {
    errors.push(`containers[${index}].name is required`);
  }

  if (!image) {
    errors.push(`containers[${index}].image is required`);
  }

  const resourcesValue = value.resources;
  let resources: Container['resources'] | undefined;

  if (resourcesValue != null) {
    if (!isPlainObject(resourcesValue)) {
      errors.push(`containers[${index}].resources must be an object`);
    } else {
      const gpus = resourcesValue.gpus == null ? undefined : String(resourcesValue.gpus).trim();
      const shmSize =
        resourcesValue.shm_size == null ? undefined : String(resourcesValue.shm_size).trim();
      const cpuLimit =
        resourcesValue.cpu_limit == null ? undefined : Number(resourcesValue.cpu_limit);
      const memoryLimit =
        resourcesValue.memory_limit == null
          ? undefined
          : String(resourcesValue.memory_limit).trim();

      if (gpus && !GPU_VALUE_RE.test(gpus)) {
        errors.push(`containers[${index}].resources.gpus must be "all" or comma-separated ids`);
      }

      if (shmSize && !SIZE_RE.test(shmSize)) {
        errors.push(`containers[${index}].resources.shm_size has invalid size format`);
      }

      if (memoryLimit && !SIZE_RE.test(memoryLimit)) {
        errors.push(`containers[${index}].resources.memory_limit has invalid size format`);
      }

      if (cpuLimit != null && (!Number.isFinite(cpuLimit) || cpuLimit <= 0)) {
        errors.push(`containers[${index}].resources.cpu_limit must be a positive number`);
      }

      resources = {
        gpus,
        shm_size: shmSize,
        cpu_limit: cpuLimit,
        memory_limit: memoryLimit,
      };
    }
  }

  const envValue = value.env;
  let env: Record<string, string> | undefined;

  if (envValue != null) {
    if (!isPlainObject(envValue)) {
      errors.push(`containers[${index}].env must be an object`);
    } else {
      env = {};
      for (const [envKey, envRawValue] of Object.entries(envValue)) {
        if (!ENV_KEY_RE.test(envKey)) {
          errors.push(`containers[${index}].env.${envKey} has invalid key format`);
          continue;
        }

        if (envRawValue == null) {
          errors.push(`containers[${index}].env.${envKey} must not be null`);
          continue;
        }

        env[envKey] = String(envRawValue);
      }
    }
  }

  if (!name || !image) {
    return null;
  }

  return {
    name,
    image,
    is_parent: Boolean(value.is_parent) || name === 'bootstrap',
    resources,
    env,
  };
};

const normalizeAttachedFile = (
  value: unknown,
  index: number,
  errors: string[],
): AttachedFile | null => {
  if (!isPlainObject(value)) {
    errors.push(`attached_files[${index}] must be an object`);
    return null;
  }

  const id = asString(value.id);
  const filename = asString(value.filename);
  const storageKey = asString(value.storage_key);
  const mimeType = asString(value.mime_type);
  const sizeBytes = Number(value.size_bytes);

  if (!id) errors.push(`attached_files[${index}].id is required`);
  if (!filename) errors.push(`attached_files[${index}].filename is required`);
  if (!storageKey) errors.push(`attached_files[${index}].storage_key is required`);
  if (!mimeType) errors.push(`attached_files[${index}].mime_type is required`);
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    errors.push(`attached_files[${index}].size_bytes must be a non-negative number`);
  }

  if (
    !id ||
    !filename ||
    !storageKey ||
    !mimeType ||
    !Number.isFinite(sizeBytes) ||
    sizeBytes < 0
  ) {
    return null;
  }

  return {
    id,
    filename,
    storage_key: storageKey,
    mime_type: mimeType,
    size_bytes: sizeBytes,
  };
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
  const executionCode = asString(payload.execution_code);
  const entrypoint = payload.entrypoint == null ? null : asString(payload.entrypoint);
  const executionLanguageRaw =
    payload.execution_language == null ? 'python' : String(payload.execution_language).trim();
  const executionLanguage = executionLanguageRaw as ExecutionLanguage;

  if (!title) {
    errors.push('title is required');
  } else if (title.length > 200) {
    errors.push('title must be at most 200 characters');
  }

  if (!executionCode) {
    errors.push('execution_code is required');
  }

  if (!VALID_EXECUTION_LANGUAGES.has(executionLanguage)) {
    errors.push('execution_language must be one of: python, javascript');
  }

  const containersRaw = payload.containers;
  const containers: Container[] = [];

  if (!Array.isArray(containersRaw) || containersRaw.length === 0) {
    errors.push('containers must be a non-empty array');
  } else {
    containersRaw.forEach((item, index) => {
      const normalized = normalizeContainer(item, index, errors);
      if (normalized) {
        containers.push(normalized);
      }
    });
  }

  const bootstrapContainers = containers.filter(
    (container) => container.name === 'bootstrap' || container.is_parent === true,
  );

  if (bootstrapContainers.length === 0) {
    errors.push('exactly one bootstrap container is required');
  }

  if (bootstrapContainers.length > 1) {
    errors.push('only one bootstrap container is allowed');
  }

  const containerNames = new Set<string>();
  for (const container of containers) {
    if (containerNames.has(container.name)) {
      errors.push(`container name "${container.name}" must be unique`);
    }
    containerNames.add(container.name);

    if (container.is_parent && container.name !== 'bootstrap') {
      errors.push(`container "${container.name}" cannot be parent; only bootstrap may be parent`);
    }
  }

  const environmentsRaw = payload.environments;
  const environments: Record<string, string> = {};

  if (environmentsRaw != null) {
    if (!isPlainObject(environmentsRaw)) {
      errors.push('environments must be an object');
    } else {
      for (const [key, value] of Object.entries(environmentsRaw)) {
        if (!ENV_KEY_RE.test(key)) {
          errors.push(`environments.${key} has invalid key format`);
          continue;
        }

        if (value == null) {
          errors.push(`environments.${key} must not be null`);
          continue;
        }

        environments[key] = String(value);
      }
    }
  }

  const attachedFilesRaw = payload.attached_files;
  const attachedFiles: AttachedFile[] = [];

  if (attachedFilesRaw != null) {
    if (!Array.isArray(attachedFilesRaw)) {
      errors.push('attached_files must be an array');
    } else {
      attachedFilesRaw.forEach((item, index) => {
        const normalized = normalizeAttachedFile(item, index, errors);
        if (normalized) {
          attachedFiles.push(normalized);
        }
      });
    }
  }

  const attachedFileIds = new Set<string>();
  const attachedFileNames = new Set<string>();

  for (const file of attachedFiles) {
    if (attachedFileIds.has(file.id)) {
      errors.push(`attached file id "${file.id}" must be unique`);
    }
    attachedFileIds.add(file.id);

    if (attachedFileNames.has(file.filename)) {
      warnings.push(`attached file name "${file.filename}" is duplicated`);
    }
    attachedFileNames.add(file.filename);
  }

  if (
    containers.length > 0 &&
    bootstrapContainers.length === 1 &&
    containers[0].name !== 'bootstrap'
  ) {
    warnings.push('bootstrap container was moved to the first position');
  }

  if (!entrypoint) {
    warnings.push('entrypoint is not set, default runtime command will be used');
  }

  if (executionLanguage === 'javascript' && containers.length > 0) {
    const bootstrap = containers.find((container) => container.name === 'bootstrap');
    if (bootstrap && !isKnownJavascriptBootstrapImage(bootstrap.image)) {
      warnings.push(
        'javascript job usually requires a Node.js-ready bootstrap image or the published Cloud Forge worker image',
      );
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
    };
  }

  const orderedContainers = [...containers].sort((left, right) => {
    if (left.name === 'bootstrap') return -1;
    if (right.name === 'bootstrap') return 1;
    return 0;
  });

  return {
    valid: true,
    errors,
    warnings,
    normalized: {
      title: title!,
      description,
      owner_id: ownerId,
      containers: orderedContainers.map((container) => ({
        ...container,
        is_parent: container.name === 'bootstrap',
      })),
      environments,
      attached_files: attachedFiles,
      execution_code: executionCode!,
      execution_language: executionLanguage,
      entrypoint,
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