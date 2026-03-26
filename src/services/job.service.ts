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

const toCreateJobData = (payload: CreateJobPayload, id: string) => ({
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

export class JobService {
  static async createJob(payload: unknown) {
    const normalized = assertValidCreateJobPayload(payload);
    const id = makeId('job');

    await JobModel.create(toCreateJobData(normalized, id));

    return { id, normalized };
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
      run,
      logs,
      worker: worker ? normalizeWorkerStatus(worker) : null,
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
}