import db from '../db/index';
import { Run, RunManifest } from '../models/job';
import { JobService } from './job.service';

const allAsync = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve((rows as T[]) || []);
    });
  });

const getAsync = <T>(sql: string, params: unknown[] = []): Promise<T | null> =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve((row as T) || null);
    });
  });

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const buildDefaultRunManifest = (row: any): RunManifest => ({
  run_id: row.id,
  job_id: row.job_id,
  execution_language: 'python',
  bootstrap_image: {
    id: row.bootstrap_image_id,
    full_image_name: '',
    name: '',
  },
  workspace: {
    root: '/workspace',
    artifacts_dir: '/workspace/artifacts',
    tmp_dir: '/workspace/tmp',
  },
  environment_variables: {},
  entrypoint: '',
  entrypoint_args: [],
  working_dir: '/workspace',
  files: [],
  control: {
    start_url: '',
    heartbeat_url: '',
    logs_url: '',
    progress_url: '',
    finish_url: '',
    cancel_url: '',
  },
  artifacts: {
    upload_url: '',
  },
});

const normalizeRunManifest = (row: any): RunManifest => {
  const fallback = buildDefaultRunManifest(row);
  const parsed = parseJson<Partial<RunManifest>>(row.run_manifest, {});

  return {
    ...fallback,
    ...parsed,
    execution_language:
      parsed.execution_language === 'javascript' ? 'javascript' : fallback.execution_language,
    bootstrap_image: {
      ...fallback.bootstrap_image,
      ...(parsed.bootstrap_image || {}),
    },
    workspace: {
      ...fallback.workspace,
      ...(parsed.workspace || {}),
    },
    environment_variables: parsed.environment_variables || fallback.environment_variables,
    entrypoint: parsed.entrypoint ?? fallback.entrypoint,
    entrypoint_args: Array.isArray(parsed.entrypoint_args)
      ? parsed.entrypoint_args
      : fallback.entrypoint_args,
    working_dir: parsed.working_dir ?? fallback.working_dir,
    files: Array.isArray(parsed.files) ? parsed.files : fallback.files,
    control: {
      ...fallback.control,
      ...(parsed.control || {}),
    },
    artifacts: {
      ...fallback.artifacts,
      ...(parsed.artifacts || {}),
    },
  };
};

export class DashboardService {
  static async getSummary() {
    const stats = await getAsync<any>(`
      SELECT
        (SELECT COUNT(*) FROM jobs) as total_jobs,
        (SELECT COUNT(*) FROM bootstrap_images WHERE status = 'completed') as ready_images,
        (SELECT COUNT(*) FROM runs) as total_runs,
        (SELECT COUNT(*) FROM runs WHERE status = 'created') as created_runs,
        (SELECT COUNT(*) FROM runs WHERE status = 'running') as running_runs,
        (SELECT COUNT(*) FROM runs WHERE status = 'finished') as finished_runs,
        (SELECT COUNT(*) FROM runs WHERE status = 'failed') as failed_runs,
        (SELECT COUNT(*) FROM runs WHERE status = 'cancelled') as cancelled_runs,
        (SELECT COUNT(*) FROM runs WHERE status = 'lost') as lost_runs
    `);

    const workers = await JobService.listWorkers();

    return {
      jobs_total: stats?.total_jobs ?? 0,
      bootstrap_images_ready: stats?.ready_images ?? 0,
      runs_total: stats?.total_runs ?? 0,
      runs_by_status: {
        created: stats?.created_runs ?? 0,
        running: stats?.running_runs ?? 0,
        finished: stats?.finished_runs ?? 0,
        failed: stats?.failed_runs ?? 0,
        cancelled: stats?.cancelled_runs ?? 0,
        lost: stats?.lost_runs ?? 0,
      },
      workers_online: workers.filter((worker) => worker.status !== 'offline').length,
      workers_total: workers.length,
    };
  }

  static async getActiveRuns(): Promise<Array<Run & { job_title: string }>> {
    const rows = await allAsync<any>(`
      SELECT
        r.*,
        j.title as job_title
      FROM runs r
      JOIN jobs j ON r.job_id = j.id
      WHERE r.status IN ('created', 'running')
      ORDER BY datetime(r.created_at) DESC
    `);

    return rows.map((row) => ({
      id: row.id,
      job_id: row.job_id,
      share_token_id: row.share_token_id,
      bootstrap_image_id: row.bootstrap_image_id,
      worker_id: row.worker_id ?? null,
      worker_name: row.worker_name ?? null,
      status: row.status,
      stage: row.stage ?? null,
      progress: row.progress ?? null,
      status_message: row.status_message ?? null,
      result: row.result ?? null,
      metrics: parseJson(row.metrics, null),
      run_manifest: normalizeRunManifest(row),
      started_at: row.started_at ?? null,
      finished_at: row.finished_at ?? null,
      last_heartbeat_at: row.last_heartbeat_at ?? null,
      cancel_requested_at: row.cancel_requested_at ?? null,
      cancel_reason: row.cancel_reason ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      job_title: row.job_title,
    }));
  }

  static async getActiveWorkers() {
    const workers = await JobService.listWorkers();
    return workers.filter((worker) => worker.status !== 'offline');
  }

  static async getRecentEvents() {
    const rows = await allAsync<any>(`
      SELECT
        r.id as run_id,
        r.job_id,
        j.title as job_title,
        r.status,
        r.stage,
        r.updated_at as created_at
      FROM runs r
      JOIN jobs j ON r.job_id = j.id
      WHERE r.status NOT IN ('created', 'running')
      ORDER BY datetime(r.updated_at) DESC
      LIMIT 20
    `);

    return rows.map((row) => ({
      id: row.run_id,
      type: 'run_status',
      status: row.status,
      message: `${row.job_title} · ${row.status}`,
      details: row.stage ? `Run ${row.run_id} · ${row.stage}` : `Run ${row.run_id}`,
      created_at: row.created_at,
    }));
  }
}