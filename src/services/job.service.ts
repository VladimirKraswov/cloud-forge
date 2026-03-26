import { v4 as uuidv4 } from 'uuid';
import { JobModel, LogModel, RunModel, ShareTokenModel } from '../models';
import {
  AttachedFile,
  Job,
  LogLevel,
  RunStatus,
  ShareToken,
  WorkspaceLayout,
} from '../models/job';

const WORKSPACE: WorkspaceLayout = {
  root: '/workspace',
  code_dir: '/workspace/code',
  input_dir: '/workspace/input',
  output_dir: '/workspace/output',
  artifacts_dir: '/workspace/artifacts',
  tmp_dir: '/workspace/tmp',
};

const makeId = (prefix: string): string => `${prefix}_${uuidv4().replace(/-/g, '')}`;

const buildAttachedFilesConfig = (attachedFiles: AttachedFile[]) =>
  attachedFiles.map((file) => ({
    ...file,
    download_path: `/artifacts/download?key=${encodeURIComponent(file.storage_key)}`,
    mount_path: `${WORKSPACE.input_dir}/${file.filename}`,
  }));

const buildDockerCommand = (job: Job, token: string, baseUrl: string): string => {
  const bootstrap =
    job.containers.find((container) => container.name === 'bootstrap' || container.is_parent) ||
    job.containers[0];

  const parts: string[] = ['docker run --rm'];

  if (bootstrap?.resources?.gpus) {
    parts.push(`--gpus ${bootstrap.resources.gpus}`);
  }

  if (bootstrap?.resources?.shm_size) {
    parts.push(`--shm-size ${bootstrap.resources.shm_size}`);
  }

  parts.push(`-e JOB_CONFIG_URL="${baseUrl}/api/run-config?token=${token}"`);
  parts.push(bootstrap.image);

  return parts.join(' \\\n  ');
};

const isTokenExpired = (token: ShareToken): boolean => {
  if (!token.expires_at) return false;
  return new Date(token.expires_at).getTime() <= Date.now();
};

const isTokenExhausted = (token: ShareToken): boolean => {
  if (token.max_claims == null) return false;
  return token.claim_count >= token.max_claims;
};

export class JobService {
  static async createJob(data: {
    title: string;
    description?: string;
    owner_id?: string;
    containers: Job['containers'];
    environments?: Job['environments'];
    attached_files?: Job['attached_files'];
    execution_code: string;
    execution_language?: Job['execution_language'];
    entrypoint?: string;
  }) {
    if (!data?.title?.trim()) {
      throw new Error('title is required');
    }

    if (!Array.isArray(data.containers) || data.containers.length === 0) {
      throw new Error('At least one container is required');
    }

    const hasBootstrap = data.containers.some(
      (container) => container.name === 'bootstrap' || container.is_parent === true,
    );

    if (!hasBootstrap) {
      throw new Error('Bootstrap container is required');
    }

    if (!data.execution_code?.trim()) {
      throw new Error('execution_code is required');
    }

    const id = makeId('job');

    await JobModel.create({
      id,
      title: data.title.trim(),
      description: data.description ?? null,
      owner_id: data.owner_id ?? null,
      containers: data.containers,
      environments: data.environments ?? {},
      attached_files: data.attached_files ?? [],
      execution_code: data.execution_code,
      execution_language: data.execution_language ?? 'python',
      entrypoint: data.entrypoint ?? null,
    });

    return { id };
  }

  static async listJobs(filters: { search?: string; status?: RunStatus }) {
    return JobModel.list(filters);
  }

  static async getJobDetails(jobId: string) {
    const job = await JobModel.findById(jobId);
    if (!job) return null;

    const [runs, shareTokens] = await Promise.all([
      RunModel.listByJobId(jobId),
      ShareTokenModel.listByJobId(jobId),
    ]);

    return { job, runs, share_tokens: shareTokens };
  }

  static async createShareToken(
    jobId: string,
    options: { expiresInSeconds?: number; maxClaims?: number },
    baseUrl: string,
  ) {
    const job = await JobModel.findById(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    const shareTokenId = makeId('st');
    const token = `cf_${uuidv4().replace(/-/g, '')}`;
    const expiresAt =
      options.expiresInSeconds && options.expiresInSeconds > 0
        ? new Date(Date.now() + options.expiresInSeconds * 1000).toISOString()
        : null;

    await ShareTokenModel.create({
      id: shareTokenId,
      job_id: jobId,
      token,
      expires_at: expiresAt,
      max_claims: options.maxClaims ?? null,
    });

    const created = await ShareTokenModel.findByToken(token);
    if (!created) {
      throw new Error('Failed to create share token');
    }

    return {
      share_token: created,
      job_config_url: `${baseUrl}/api/run-config?token=${token}`,
      docker_image:
        job.containers.find((container) => container.name === 'bootstrap' || container.is_parent)
          ?.image || job.containers[0]?.image,
      docker_command: buildDockerCommand(job, token, baseUrl),
    };
  }

  static async claimRunByToken(token: string) {
    const shareToken = await ShareTokenModel.findByToken(token);
    if (!shareToken) {
      throw new Error('Share token not found');
    }

    if (shareToken.revoked) {
      throw new Error('Share token revoked');
    }

    if (isTokenExpired(shareToken)) {
      throw new Error('Share token expired');
    }

    if (isTokenExhausted(shareToken)) {
      throw new Error('Share token exhausted');
    }

    const job = await JobModel.findById(shareToken.job_id);
    if (!job) {
      throw new Error('Job not found for share token');
    }

    const runId = makeId('run');

    const configSnapshot = {
      job_id: job.id,
      containers: job.containers,
      environments: job.environments,
      attached_files: job.attached_files,
      execution_code: job.execution_code,
      execution_language: job.execution_language,
      entrypoint: job.entrypoint ?? null,
      workspace: WORKSPACE,
    };

    await RunModel.create({
      id: runId,
      job_id: job.id,
      share_token_id: shareToken.id,
      config_snapshot: configSnapshot,
    });

    await ShareTokenModel.incrementClaim(shareToken.id);

    return {
      run_id: runId,
      job_id: job.id,
      config: {
        ...configSnapshot,
        attached_files: buildAttachedFilesConfig(job.attached_files),
      },
    };
  }

  static async markRunStarted(runId: string, workerName?: string) {
    const run = await RunModel.findById(runId);
    if (!run) {
      throw new Error('Run not found');
    }

    await RunModel.markRunning(runId, workerName);
  }

  static async addRunLog(runId: string, message: string, level: LogLevel = 'info') {
    const run = await RunModel.findById(runId);
    if (!run) {
      throw new Error('Run not found');
    }

    await LogModel.add(runId, message, level);
  }

  static async finishRun(
    runId: string,
    status: Extract<RunStatus, 'finished' | 'failed' | 'cancelled' | 'lost'>,
    result?: string,
    metrics?: unknown,
  ) {
    const run = await RunModel.findById(runId);
    if (!run) {
      throw new Error('Run not found');
    }

    await RunModel.finish(runId, status, result, metrics);
  }

  static async getRun(runId: string) {
    const run = await RunModel.findById(runId);
    if (!run) return null;

    const logs = await LogModel.listByRunId(runId);
    return { run, logs };
  }
}