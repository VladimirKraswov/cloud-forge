import { v4 as uuidv4 } from 'uuid';
import {
  JobModel,
  LogModel,
  RunArtifactModel,
  RunModel,
  ShareTokenModel,
  WorkerModel,
} from '../models';
import {
  AttachedFile,
  Job,
  LogLevel,
  RunStatus,
  ShareToken,
  Worker,
  WorkspaceLayout,
} from '../models/job';
import { config } from '../utils/config';
import { assertValidCreateJobPayload, CreateJobPayload } from '../utils/job-validation';

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

/**
 * Generates a docker run command for remote execution.
 * Поддерживает кастомный bootstrap.image из job.containers
 */
const buildDockerCommand = (job: Job, token: string, baseUrl: string): string => {
  // Ищем bootstrap-контейнер (приоритет: is_parent → name === 'bootstrap' → первый контейнер)
  const bootstrap = job.containers.find((c) => c.is_parent === true) ||
                    job.containers.find((c) => c.name === 'bootstrap') ||
                    job.containers[0];

  const fallbackImage = `${config.publishedWorkerImage}:${config.publishedWorkerTag}`;
  const image = bootstrap?.image || fallbackImage;

  const parts: string[] = ['docker run --pull always --rm'];

  // === Resources из bootstrap-контейнера ===
  if (bootstrap?.resources?.gpus) {
    parts.push(`--gpus ${bootstrap.resources.gpus}`);
  }
  if (bootstrap?.resources?.shm_size) {
    parts.push(`--shm-size ${bootstrap.resources.shm_size}`);
  }
  if (bootstrap?.resources?.memory_limit) {
    parts.push(`--memory ${bootstrap.resources.memory_limit}`);
  }
  if (bootstrap?.resources?.cpu_limit) {
    parts.push(`--cpus ${bootstrap.resources.cpu_limit}`);
  }

  // Передаём переменные окружения из bootstrap.env + JOB_CONFIG_URL
  if (bootstrap?.env) {
    Object.entries(bootstrap.env).forEach(([key, value]) => {
      parts.push(`-e ${key}="${value}"`);
    });
  }

  parts.push(`-e JOB_CONFIG_URL="${baseUrl}/api/run-config?token=${token}"`);

  // Самое важное — используем образ из bootstrap.image (или fallback)!
  parts.push(image);

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

const isRunTerminal = (status: RunStatus): boolean =>
  ['finished', 'failed', 'cancelled', 'lost'].includes(status);

const normalizeWorkerStatus = (worker: Worker): Worker => {
  if (!worker.last_seen_at) {
    return { ...worker, status: 'offline' };
  }

  const lastSeenMs = new Date(worker.last_seen_at).getTime();
  if (Number.isNaN(lastSeenMs)) {
    return { ...worker, status: 'offline' };
  }

  const ageSeconds = (Date.now() - lastSeenMs) / 1000;

  if (ageSeconds > config.workerOfflineTimeoutSeconds) {
    return { ...worker, status: 'offline' };
  }

  if (worker.current_run_id) {
    return { ...worker, status: 'busy' };
  }

  return { ...worker, status: 'online' };
};

export class JobService {
  static toCreateJobData = (payload: CreateJobPayload, id: string) => ({
    id,
    title: payload.title,
    description: payload.description ?? null,
    owner_id: payload.owner_id ?? null,
    containers: payload.containers,
    environments: payload.environments ?? {},
    attached_files: payload.attached_files ?? [],
    execution_code: payload.execution_code,
    execution_language: payload.execution_language,
    entrypoint: payload.entrypoint ?? null,
  });

  static async createJob(payload: unknown) {
    const normalized = assertValidCreateJobPayload(payload);
    const id = makeId('job');

    await JobModel.create(this.toCreateJobData(normalized, id));

    const created = await JobModel.findById(id);
    if (!created) {
      throw new Error('Failed to load created job');
    }

    return created;
  }

  static async listJobs(filters: {
    search?: string;
    status?: RunStatus;
    limit?: number;
    offset?: number;
  }) {
    return JobModel.list(filters);
  }

  static async getJobDetails(jobId: string) {
    const job = await JobModel.findById(jobId);
    if (!job) return null;

    const [shareTokens, totalRuns, activeRunsCount] = await Promise.all([
      ShareTokenModel.listByJobId(jobId),
      RunModel.countByJobId(jobId),
      RunModel.countActiveByJobId(jobId),
    ]);

    return {
      job,
      share_tokens: shareTokens.map((t) => this.normalizeShareToken(t)),
      stats: {
        total_runs: totalRuns,
        active_runs: activeRunsCount,
      },
    };
  }

  static async updateJob(jobId: string, payload: Partial<Job>) {
    const existing = await JobModel.findById(jobId);
    if (!existing) throw new Error('Job not found');

    const merged = {
      ...existing,
      ...payload,
      id: jobId,
    };

    const normalized = assertValidCreateJobPayload(merged);

    await JobModel.update(jobId, normalized);

    const updated = await JobModel.findById(jobId);
    if (!updated) {
      throw new Error('Failed to load updated job');
    }

    return updated;
  }

  static async deleteJob(jobId: string) {
    const job = await JobModel.findById(jobId);
    if (!job) throw new Error('Job not found');

    const activeRuns = await RunModel.countActiveByJobId(jobId);

    if (activeRuns > 0) {
      throw new Error('Cannot delete job with active runs');
    }

    await JobModel.delete(jobId);
  }

  static async cloneJob(jobId: string) {
    const job = await JobModel.findById(jobId);
    if (!job) throw new Error('Job not found');

    const newId = makeId('job');
    const clonedData = {
      ...job,
      id: newId,
      title: `${job.title} (copy)`,
    };

    await JobModel.create(clonedData);

    const cloned = await JobModel.findById(newId);
    if (!cloned) {
      throw new Error('Failed to load cloned job');
    }

    return cloned;
  }

  static async listJobRuns(jobId: string, limit = 10, offset = 0) {
    const job = await JobModel.findById(jobId);
    if (!job) throw new Error('Job not found');

    return RunModel.listByJobIdPaginated(jobId, limit, offset);
  }

  static async listJobShareTokens(jobId: string) {
    const job = await JobModel.findById(jobId);
    if (!job) throw new Error('Job not found');

    const tokens = await ShareTokenModel.listByJobId(jobId);
    return tokens.map((token) => this.normalizeShareToken(token));
  }

  static async getShareToken(tokenId: string, baseUrl: string) {
    const token = await ShareTokenModel.findById(tokenId);
    if (!token) return null;

    const job = await JobModel.findById(token.job_id);
    if (!job) return null;

    const bootstrap = job.containers.find((c) => c.is_parent === true) ||
                      job.containers.find((c) => c.name === 'bootstrap') ||
                      job.containers[0];

    const dockerCommand = buildDockerCommand(job, token.token, baseUrl);

    return {
      ...this.normalizeShareToken(token),
      base_url: baseUrl,
      claim_url: `${baseUrl}/api/run-config?token=${token.token}`,
      share_url: `${baseUrl}/api/run-config?token=${token.token}`,
      docker_image: bootstrap?.image || `${config.publishedWorkerImage}:${config.publishedWorkerTag}`,
      docker_command: dockerCommand,
      worker_command: dockerCommand,
    };
  }

  private static normalizeShareToken(token: ShareToken) {
    return {
      ...token,
      remaining_claims:
        token.max_claims != null ? Math.max(0, token.max_claims - token.claim_count) : null,
    };
  }

  static async revokeShareToken(tokenId: string) {
    const token = await ShareTokenModel.findById(tokenId);
    if (!token) throw new Error('Share token not found');

    await ShareTokenModel.revoke(tokenId);
  }

  static async createShareToken(
    jobId: string,
    options: {
      expiresInSeconds?: number;
      expiresAt?: string | null;
      maxClaims?: number;
    },
    baseUrl: string,
  ) {
    const job = await JobModel.findById(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    const shareTokenId = makeId('st');
    const token = `cf_${uuidv4().replace(/-/g, '')}`;

    let expiresAt: string | null = null;

    if (options.expiresAt) {
      const parsed = new Date(options.expiresAt);
      if (!Number.isNaN(parsed.getTime())) {
        expiresAt = parsed.toISOString();
      }
    } else if (options.expiresInSeconds && options.expiresInSeconds > 0) {
      expiresAt = new Date(Date.now() + options.expiresInSeconds * 1000).toISOString();
    }

    await ShareTokenModel.create({
      id: shareTokenId,
      job_id: jobId,
      token,
      expires_at: expiresAt,
      max_claims: options.maxClaims ?? null,
    });

    const created = await this.getShareToken(shareTokenId, baseUrl);
    if (!created) {
      throw new Error('Failed to create share token');
    }

    return created;
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

  static async markRunStarted(
    runId: string,
    worker: {
      id: string;
      name: string;
      host?: string | null;
      capabilities?: Record<string, unknown> | null;
    },
  ) {
    const run = await RunModel.findById(runId);
    if (!run) {
      throw new Error('Run not found');
    }

    if (isRunTerminal(run.status)) {
      throw new Error(`Run already ${run.status}`);
    }

    await WorkerModel.upsertHeartbeat({
      id: worker.id,
      name: worker.name,
      host: worker.host ?? null,
      current_run_id: runId,
      capabilities: worker.capabilities ?? null,
      status: 'busy',
    });

    await RunModel.markRunning(runId, worker.id, worker.name);
  }

  static async heartbeatRun(
    runId: string,
    worker: {
      id: string;
      name: string;
      host?: string | null;
      capabilities?: Record<string, unknown> | null;
    },
  ): Promise<{ should_stop: boolean; stop_reason?: string }> {
    const run = await RunModel.findById(runId);
    if (!run) {
      throw new Error('Run not found');
    }

    await WorkerModel.upsertHeartbeat({
      id: worker.id,
      name: worker.name,
      host: worker.host ?? null,
      current_run_id: runId,
      capabilities: worker.capabilities ?? null,
      status: 'busy',
    });

    if (!isRunTerminal(run.status)) {
      await RunModel.touchHeartbeat(runId);
    }

    if (run.status === 'cancelled') {
      return {
        should_stop: true,
        stop_reason: run.cancel_reason || 'Run cancelled',
      };
    }

    if (run.status === 'lost') {
      return {
        should_stop: true,
        stop_reason: 'Run marked as lost by orchestrator',
      };
    }

    if (run.cancel_requested_at) {
      return {
        should_stop: true,
        stop_reason: run.cancel_reason || 'Run cancellation requested',
      };
    }

    if (run.status === 'finished' || run.status === 'failed') {
      return {
        should_stop: true,
        stop_reason: `Run already ${run.status}`,
      };
    }

    return { should_stop: false };
  }

  static async addRunLog(runId: string, message: string, level: LogLevel = 'info') {
    const run = await RunModel.findById(runId);
    if (!run) {
      throw new Error('Run not found');
    }

    await LogModel.add(runId, message, level);
  }

  static async cancelRun(runId: string, reason?: string) {
    const run = await RunModel.findById(runId);
    if (!run) {
      throw new Error('Run not found');
    }

    if (run.status === 'cancelled') {
      return {
        run_id: runId,
        status: 'cancelled' as const,
        final: true,
      };
    }

    if (run.status === 'finished' || run.status === 'failed' || run.status === 'lost') {
      throw new Error(`Cannot cancel run in terminal status: ${run.status}`);
    }

    if (run.status === 'created') {
      await this.finishRun(runId, 'cancelled', reason || 'Run cancelled before start');
      return {
        run_id: runId,
        status: 'cancelled' as const,
        final: true,
      };
    }

    await RunModel.requestCancel(runId, reason || 'Run cancelled by user');

    return {
      run_id: runId,
      status: run.status,
      cancel_requested: true,
      final: false,
    };
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

    if (isRunTerminal(run.status)) {
      return;
    }

    await RunModel.finish(runId, status, result, metrics);

    if (run.worker_id) {
      await WorkerModel.release(run.worker_id);
    }
  }

  static async markStaleRunsLost() {
    const cutoff = new Date(Date.now() - config.workerOfflineTimeoutSeconds * 1000).toISOString();
    const staleRuns = await RunModel.listStaleRuns(cutoff);

    const lostRunIds: string[] = [];

    for (const run of staleRuns) {
      if (isRunTerminal(run.status)) {
        continue;
      }

      await this.finishRun(
        run.id,
        'lost',
        'Worker heartbeat timed out',
        {
          reason: 'heartbeat_timeout',
          cutoff,
          last_heartbeat_at: run.last_heartbeat_at,
        },
      );

      lostRunIds.push(run.id);
    }

    return lostRunIds;
  }

  static async registerRunArtifact(data: {
    run_id: string;
    filename: string;
    relative_path: string;
    size_bytes: number;
    storage_key: string;
    mime_type: string;
  }) {
    const run = await RunModel.findById(data.run_id);
    if (!run) {
      throw new Error('Run not found');
    }

    const artifactId = makeId('ra');

    await RunArtifactModel.create({
      id: artifactId,
      run_id: data.run_id,
      filename: data.filename,
      relative_path: data.relative_path,
      size_bytes: data.size_bytes,
      storage_key: data.storage_key,
      mime_type: data.mime_type,
    });

    return {
      id: artifactId,
      run_id: data.run_id,
      filename: data.filename,
      relative_path: data.relative_path,
      size_bytes: data.size_bytes,
      storage_key: data.storage_key,
      mime_type: data.mime_type,
    };
  }

  static async getRun(runId: string) {
    const run = await RunModel.findById(runId);
    if (!run) return null;

    const [logs, artifacts, worker] = await Promise.all([
      LogModel.listByRunId(runId),
      RunArtifactModel.listByRunId(runId),
      run.worker_id ? WorkerModel.findById(run.worker_id) : Promise.resolve(null),
    ]);

    return {
      ...run,
      worker_id: run.worker_id ?? worker?.id ?? null,
      worker_name: run.worker_name ?? worker?.name ?? null,
      logs,
      artifacts: artifacts.map((artifact) => ({
        ...artifact,
        download_path: `/artifacts/download?key=${encodeURIComponent(artifact.storage_key)}`,
      })),
    };
  }

  static async listWorkers() {
    const workers = await WorkerModel.list();
    return workers.map(normalizeWorkerStatus);
  }

  static async getWorker(workerId: string) {
    const worker = await WorkerModel.findById(workerId);
    if (!worker) return null;
    return normalizeWorkerStatus(worker);
  }

  static async getJob(jobId: string) {
    return JobModel.findById(jobId);
  }
}