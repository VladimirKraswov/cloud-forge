import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  BootstrapImageLogModel,
  BootstrapImageModel,
  JobFileModel,
  JobModel,
  LogModel,
  RunArtifactModel,
  RunEventModel,
  RunModel,
  ShareTokenModel,
  WorkerModel,
} from '../models';
import {
  Job,
  JobFile,
  LogLevel,
  RunManifest,
  RunManifestFile,
  RunStatus,
  ShareToken,
  Worker,
  WorkspaceLayout,
} from '../models/job';
import { config } from '../utils/config';
import {
  assertValidCreateJobPayload,
  assertValidRelativePath,
  CreateJobPayload,
} from '../utils/job-validation';

const WORKSPACE: WorkspaceLayout = {
  root: '/workspace',
  artifacts_dir: '/workspace/artifacts',
  tmp_dir: '/workspace/tmp',
};

const makeId = (prefix: string): string => `${prefix}_${uuidv4().replace(/-/g, '')}`;

const normalizePath = (value: string): string =>
  path.posix.normalize(value.replace(/\\/g, '/')).replace(/^\/+/, '');

const asString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
};

const asNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const asBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off', ''].includes(normalized)) return false;
  }
  return fallback;
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

const buildDockerCommand = (
  job: Job,
  token: string,
  baseUrl: string,
  image: string,
): string => {
  const parts: string[] = ['docker run --pull always --rm'];

  if (job.resources?.gpus) {
    parts.push(`--gpus ${job.resources.gpus}`);
  }
  if (job.resources?.shm_size) {
    parts.push(`--shm-size ${job.resources.shm_size}`);
  }
  if (job.resources?.memory_limit) {
    parts.push(`--memory ${job.resources.memory_limit}`);
  }
  if (job.resources?.cpu_limit) {
    parts.push(`--cpus ${job.resources.cpu_limit}`);
  }

  parts.push(`-e JOB_CONFIG_URL="${baseUrl}/api/run-config?token=${token}"`);
  parts.push(image);

  return parts.join(' \\\n  ');
};

export class JobService {
  static toCreateJobData = (payload: CreateJobPayload, id: string) => ({
    id,
    title: payload.title,
    description: payload.description ?? null,
    owner_id: payload.owner_id ?? null,
    bootstrap_image_id: payload.bootstrap_image_id,
    environment_variables: payload.environment_variables ?? {},
    resources: payload.resources ?? null,
    entrypoint: payload.entrypoint,
    entrypoint_args: payload.entrypoint_args ?? [],
    working_dir: payload.working_dir ?? '/workspace',
  });

  static async createJob(payload: unknown) {
    const normalized = assertValidCreateJobPayload(payload);
    const bootstrapImage = await BootstrapImageModel.findById(normalized.bootstrap_image_id);

    if (!bootstrapImage || bootstrapImage.status !== 'completed') {
      throw new Error('Bootstrap image not found or not ready');
    }

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

  static async getJob(jobId: string) {
    return JobModel.findById(jobId);
  }

  static async getJobDetails(jobId: string) {
    const job = await JobModel.findById(jobId);
    if (!job) return null;

    const [bootstrapImage, files, shareTokens, totalRuns, activeRunsCount] = await Promise.all([
      BootstrapImageModel.findById(job.bootstrap_image_id),
      JobFileModel.listByJobId(jobId),
      ShareTokenModel.listByJobId(jobId),
      RunModel.countByJobId(jobId),
      RunModel.countActiveByJobId(jobId),
    ]);

    return {
      job,
      bootstrap_image: bootstrapImage,
      files,
      share_tokens: shareTokens.map((t: ShareToken) => this.normalizeShareToken(t)),
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
    const bootstrapImage = await BootstrapImageModel.findById(normalized.bootstrap_image_id);

    if (!bootstrapImage || bootstrapImage.status !== 'completed') {
      throw new Error('Bootstrap image not found or not ready');
    }

    await JobModel.update(jobId, normalized as Partial<Job>);

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

    await JobFileModel.deleteByJobId(jobId);
    await JobModel.delete(jobId);
  }

  static async cloneJob(jobId: string) {
    const job = await JobModel.findById(jobId);
    if (!job) throw new Error('Job not found');

    const files = await JobFileModel.listByJobId(jobId);
    const newId = makeId('job');

    await JobModel.create({
      ...job,
      id: newId,
      title: `${job.title} (copy)`,
    });

    for (const file of files) {
      const fileId = makeId('jf');
      if (file.source_type === 'inline') {
        await JobFileModel.upsertInline({
          id: fileId,
          job_id: newId,
          relative_path: file.relative_path,
          filename: file.filename,
          inline_content: file.inline_content || '',
          mime_type: file.mime_type,
          is_executable: file.is_executable,
        });
      } else {
        await JobFileModel.upsertUploaded({
          id: fileId,
          job_id: newId,
          relative_path: file.relative_path,
          filename: file.filename,
          storage_key: file.storage_key || '',
          mime_type: file.mime_type,
          size_bytes: file.size_bytes,
          is_executable: file.is_executable,
        });
      }
    }

    const cloned = await JobModel.findById(newId);
    if (!cloned) {
      throw new Error('Failed to load cloned job');
    }

    return cloned;
  }

  static async listJobRuns(jobId: string, limit = 10, offset = 0) {
    const job = await JobModel.findById(jobId);
    if (!job) throw new Error('Job not found');

    const runs = await RunModel.listByJobIdPaginated(jobId, limit, offset);
    const total = await RunModel.countByJobId(jobId);
    return {
      items: runs,
      total,
      limit,
      offset,
    };
  }

  static async listJobShareTokens(jobId: string) {
    const job = await JobModel.findById(jobId);
    if (!job) throw new Error('Job not found');

    const tokens = await ShareTokenModel.listByJobId(jobId);
    return tokens.map((token: ShareToken) => this.normalizeShareToken(token));
  }

  static async listJobFiles(jobId: string) {
    const job = await JobModel.findById(jobId);
    if (!job) throw new Error('Job not found');

    return JobFileModel.listByJobId(jobId);
  }

  static async saveInlineJobFile(data: {
    job_id: string;
    relative_path: string;
    content: string;
    mime_type?: string;
    is_executable?: boolean;
  }) {
    const job = await JobModel.findById(data.job_id);
    if (!job) throw new Error('Job not found');

    const relativePath = assertValidRelativePath(data.relative_path);
    const filename = path.posix.basename(relativePath);

    await JobFileModel.upsertInline({
      id: makeId('jf'),
      job_id: data.job_id,
      relative_path: relativePath,
      filename,
      inline_content: data.content,
      mime_type: data.mime_type || 'text/plain; charset=utf-8',
      is_executable: Boolean(data.is_executable),
    });

    const saved = await JobFileModel.findByJobIdAndPath(data.job_id, relativePath);
    if (!saved) {
      throw new Error('Failed to save job file');
    }

    return saved;
  }

  static async registerUploadedJobFile(data: {
    job_id: string;
    relative_path: string;
    filename: string;
    storage_key: string;
    mime_type: string;
    size_bytes: number;
    is_executable?: boolean;
  }) {
    const job = await JobModel.findById(data.job_id);
    if (!job) throw new Error('Job not found');

    const relativePath = assertValidRelativePath(data.relative_path);

    await JobFileModel.upsertUploaded({
      id: makeId('jf'),
      job_id: data.job_id,
      relative_path: relativePath,
      filename: data.filename,
      storage_key: data.storage_key,
      mime_type: data.mime_type,
      size_bytes: data.size_bytes,
      is_executable: Boolean(data.is_executable),
    });

    const saved = await JobFileModel.findByJobIdAndPath(data.job_id, relativePath);
    if (!saved) {
      throw new Error('Failed to register uploaded job file');
    }

    return saved;
  }

  static async getJobFile(jobId: string, relativePath: string): Promise<JobFile> {
    const job = await JobModel.findById(jobId);
    if (!job) throw new Error('Job not found');

    const normalized = assertValidRelativePath(relativePath);
    const file = await JobFileModel.findByJobIdAndPath(jobId, normalized);
    if (!file) {
      throw new Error('Job file not found');
    }

    return file;
  }

  static async deleteJobFile(jobId: string, relativePath: string) {
    await this.getJobFile(jobId, relativePath);
    await JobFileModel.deleteByJobIdAndPath(jobId, assertValidRelativePath(relativePath));
  }

  static async getRunJobFile(runId: string, relativePath: string): Promise<JobFile> {
    const run = await RunModel.findById(runId);
    if (!run) throw new Error('Run not found');
    return this.getJobFile(run.job_id, relativePath);
  }

  static async getShareToken(tokenId: string, baseUrl: string) {
    const token = await ShareTokenModel.findById(tokenId);
    if (!token) return null;

    const job = await JobModel.findById(token.job_id);
    if (!job) return null;

    const bootstrapImage = await BootstrapImageModel.findById(job.bootstrap_image_id);
    if (!bootstrapImage) return null;

    const dockerCommand = buildDockerCommand(
      job,
      token.token,
      baseUrl,
      bootstrapImage.full_image_name,
    );

    return {
      ...this.normalizeShareToken(token),
      base_url: baseUrl,
      claim_url: `${baseUrl}/api/run-config?token=${token.token}`,
      share_url: `${baseUrl}/api/run-config?token=${token.token}`,
      docker_image: bootstrapImage.full_image_name,
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

    const bootstrapImage = await BootstrapImageModel.findById(job.bootstrap_image_id);
    if (!bootstrapImage || bootstrapImage.status !== 'completed') {
      throw new Error('Bootstrap image not found or not ready');
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

  static async claimRunByToken(token: string, baseUrl: string) {
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

    const bootstrapImage = await BootstrapImageModel.findById(job.bootstrap_image_id);
    if (!bootstrapImage || bootstrapImage.status !== 'completed') {
      throw new Error('Bootstrap image not found or not ready');
    }

    const jobFiles = await JobFileModel.listByJobId(job.id);
    const runId = makeId('run');

    const manifestFiles: RunManifestFile[] = jobFiles.map(
      (file): RunManifestFile => {
        const relativePath = asString(
          (file as { relative_path?: unknown }).relative_path,
          asString((file as { filename?: unknown }).filename, 'file'),
        ).trim();

        const filename =
          asString((file as { filename?: unknown }).filename).trim() ||
          relativePath.split('/').filter(Boolean).pop() ||
          'file';

        const sourceTypeRaw = asString((file as { source_type?: unknown }).source_type, 'upload');
        const sourceType: RunManifestFile['source_type'] =
          sourceTypeRaw === 'inline' ? 'inline' : 'upload';

        return {
          relative_path: relativePath,
          filename,
          size_bytes: asNumber((file as { size_bytes?: unknown }).size_bytes, 0),
          mime_type: asString(
            (file as { mime_type?: unknown }).mime_type,
            'application/octet-stream',
          ),
          is_executable: asBoolean(
            (file as { is_executable?: unknown }).is_executable,
            false,
          ),
          source_type: sourceType,
          download_url:
            `${baseUrl}/api/runs/${runId}/job-files/content?relativePath=` +
            encodeURIComponent(relativePath),
        };
      },
    );

    const runManifest: RunManifest = {
      run_id: runId,
      job_id: job.id,
      bootstrap_image: {
        id: bootstrapImage.id,
        full_image_name: bootstrapImage.full_image_name,
        name: bootstrapImage.name,
      },
      workspace: WORKSPACE,
      environment_variables: job.environment_variables,
      entrypoint: job.entrypoint,
      entrypoint_args: job.entrypoint_args || [],
      working_dir: job.working_dir || WORKSPACE.root,
      files: manifestFiles,
      control: {
        start_url: `${baseUrl}/api/runs/start`,
        heartbeat_url: `${baseUrl}/api/runs/heartbeat`,
        logs_url: `${baseUrl}/api/runs/logs`,
        progress_url: `${baseUrl}/api/runs/progress`,
        finish_url: `${baseUrl}/api/runs/finish`,
        cancel_url: `${baseUrl}/api/runs/${runId}/cancel`,
      },
      artifacts: {
        upload_url: `${baseUrl}/artifacts/upload-run?runId=${runId}`,
      },
    };

    await RunModel.create({
      id: runId,
      job_id: job.id,
      share_token_id: shareToken.id,
      bootstrap_image_id: bootstrapImage.id,
      run_manifest: runManifest,
    });

    await ShareTokenModel.incrementClaim(shareToken.id);

    return {
      run_id: runId,
      job_id: job.id,
      config: runManifest,
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
    await RunEventModel.create({
      id: makeId('evt'),
      run_id: runId,
      type: 'status',
      stage: run.stage ?? null,
      progress: run.progress ?? null,
      message: 'Run started',
      payload: {
        worker_id: worker.id,
        worker_name: worker.name,
      },
    });
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
    await RunEventModel.create({
      id: makeId('evt'),
      run_id: runId,
      type: 'log',
      level,
      message,
      stage: run.stage ?? null,
      progress: run.progress ?? null,
    });
  }

  static async addRunProgress(data: {
    run_id: string;
    stage?: string | null;
    progress?: number | null;
    message?: string | null;
    extra?: Record<string, unknown> | null;
  }) {
    const run = await RunModel.findById(data.run_id);
    if (!run) {
      throw new Error('Run not found');
    }

    const normalizedProgress =
      data.progress == null ? null : Math.max(0, Math.min(100, Number(data.progress)));

    await RunModel.updateProgress({
      id: data.run_id,
      stage: data.stage ?? run.stage ?? null,
      progress: normalizedProgress,
      status_message: data.message ?? run.status_message ?? null,
      metrics: data.extra ?? undefined,
    });

    await RunEventModel.create({
      id: makeId('evt'),
      run_id: data.run_id,
      type: 'progress',
      stage: data.stage ?? run.stage ?? null,
      progress: normalizedProgress,
      message: data.message ?? null,
      payload: data.extra ?? null,
    });
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
    await RunEventModel.create({
      id: makeId('evt'),
      run_id: runId,
      type: 'status',
      stage: run.stage ?? null,
      progress: run.progress ?? null,
      message: reason || 'Run cancellation requested',
      payload: {
        cancel_requested: true,
      },
    });

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
    await RunEventModel.create({
      id: makeId('evt'),
      run_id: runId,
      type: 'status',
      stage: run.stage ?? null,
      progress: run.progress ?? null,
      message: result || `Run ${status}`,
      payload: {
        status,
        metrics: metrics ?? null,
      },
    });

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

      await this.finishRun(run.id, 'lost', 'Worker heartbeat timed out', {
        reason: 'heartbeat_timeout',
        cutoff,
        last_heartbeat_at: run.last_heartbeat_at,
      });

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
      relative_path: normalizePath(data.relative_path),
      size_bytes: data.size_bytes,
      storage_key: data.storage_key,
      mime_type: data.mime_type,
    });

    return {
      id: artifactId,
      run_id: data.run_id,
      filename: data.filename,
      relative_path: normalizePath(data.relative_path),
      size_bytes: data.size_bytes,
      storage_key: data.storage_key,
      mime_type: data.mime_type,
    };
  }

  static async getRun(runId: string) {
    const run = await RunModel.findById(runId);
    if (!run) return null;

    const [logs, events, artifacts, worker] = await Promise.all([
      LogModel.listByRunId(runId),
      RunEventModel.listByRunId(runId),
      RunArtifactModel.listByRunId(runId),
      run.worker_id ? WorkerModel.findById(run.worker_id) : Promise.resolve(null),
    ]);

    return {
      ...run,
      worker_id: run.worker_id ?? worker?.id ?? null,
      worker_name: run.worker_name ?? worker?.name ?? null,
      logs,
      events,
      artifacts: artifacts.map((artifact) => {
        const storageKey = asString(
          (artifact as { storage_key?: unknown }).storage_key,
          '',
        );

        return {
          ...artifact,
          download_path: `/artifacts/download?key=${encodeURIComponent(storageKey)}`,
          content_path: `/artifacts/content?key=${encodeURIComponent(storageKey)}`,
        };
      }),
    };
  }

  static async listRunEvents(runId: string) {
    const run = await RunModel.findById(runId);
    if (!run) throw new Error('Run not found');
    return RunEventModel.listByRunId(runId);
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

  static async listBootstrapImages(options?: {
    status?: 'draft' | 'building' | 'pushing' | 'completed' | 'failed';
  }) {
    return BootstrapImageModel.list(options);
  }

  static async getBootstrapImage(imageId: string) {
    return BootstrapImageModel.findById(imageId);
  }

  static async listBootstrapImageLogs(imageId: string) {
    const image = await BootstrapImageModel.findById(imageId);
    if (!image) {
      throw new Error('Bootstrap image not found');
    }

    return BootstrapImageLogModel.listByImageId(imageId);
  }
}