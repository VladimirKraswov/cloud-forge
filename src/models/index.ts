import db from '../db/index';
import {
  Job,
  JobListItem,
  LogEntry,
  LogLevel,
  Run,
  RunArtifact,
  RunConfigSnapshot,
  RunStatus,
  ShareToken,
  Worker,
  WorkerStatus,
} from './job';

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const getAsync = <T>(sql: string, params: unknown[] = []): Promise<T | null> =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve((row as T) || null);
    });
  });

const allAsync = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve((rows as T[]) || []);
    });
  });

const runAsync = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

const mapJobRow = (row: any): Job => ({
  id: row.id,
  title: row.title,
  description: row.description ?? null,
  owner_id: row.owner_id ?? null,
  containers: parseJson(row.containers, []),
  environments: parseJson(row.environments, {}),
  attached_files: parseJson(row.attached_files, []),
  execution_code: row.execution_code,
  execution_language: row.execution_language,
  entrypoint: row.entrypoint ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const mapRunRow = (row: any): Run => ({
  id: row.id,
  job_id: row.job_id,
  share_token_id: row.share_token_id,
  worker_id: row.worker_id ?? null,
  status: row.status,
  worker_name: row.worker_name ?? null,
  result: row.result ?? null,
  metrics: parseJson(row.metrics, null),
  config_snapshot: parseJson<RunConfigSnapshot>(row.config_snapshot, {
    job_id: row.job_id,
    containers: [],
    environments: {},
    attached_files: [],
    execution_code: '',
    execution_language: 'python',
    entrypoint: null,
    workspace: {
      root: '/workspace',
      code_dir: '/workspace/code',
      input_dir: '/workspace/input',
      output_dir: '/workspace/output',
      artifacts_dir: '/workspace/artifacts',
      tmp_dir: '/workspace/tmp',
    },
  }),
  started_at: row.started_at ?? null,
  finished_at: row.finished_at ?? null,
  last_heartbeat_at: row.last_heartbeat_at ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const mapShareTokenRow = (row: any): ShareToken => ({
  id: row.id,
  job_id: row.job_id,
  token: row.token,
  expires_at: row.expires_at ?? null,
  max_claims: row.max_claims ?? null,
  claim_count: row.claim_count ?? 0,
  revoked: Boolean(row.revoked),
  last_claimed_at: row.last_claimed_at ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const mapWorkerRow = (row: any): Worker => ({
  id: row.id,
  name: row.name,
  host: row.host ?? null,
  status: row.status as WorkerStatus,
  current_run_id: row.current_run_id ?? null,
  capabilities: parseJson<Record<string, unknown> | null>(row.capabilities, null),
  last_seen_at: row.last_seen_at ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const mapRunArtifactRow = (row: any): RunArtifact => ({
  id: row.id,
  run_id: row.run_id,
  filename: row.filename,
  relative_path: row.relative_path,
  size_bytes: row.size_bytes,
  storage_key: row.storage_key,
  mime_type: row.mime_type,
  created_at: row.created_at,
});

export class JobModel {
  static async create(jobData: {
    id: string;
    title: string;
    description?: string | null;
    owner_id?: string | null;
    containers: Job['containers'];
    environments?: Job['environments'];
    attached_files?: Job['attached_files'];
    execution_code: string;
    execution_language?: Job['execution_language'];
    entrypoint?: string | null;
  }): Promise<void> {
    await runAsync(
      `INSERT INTO jobs (
        id, title, description, owner_id, containers, environments, attached_files,
        execution_code, execution_language, entrypoint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        jobData.id,
        jobData.title,
        jobData.description ?? null,
        jobData.owner_id ?? null,
        JSON.stringify(jobData.containers || []),
        JSON.stringify(jobData.environments || {}),
        JSON.stringify(jobData.attached_files || []),
        jobData.execution_code,
        jobData.execution_language || 'python',
        jobData.entrypoint ?? null,
      ],
    );
  }

  static async findById(id: string): Promise<Job | null> {
    const row = await getAsync<any>('SELECT * FROM jobs WHERE id = ?', [id]);
    return row ? mapJobRow(row) : null;
  }

  static async list(filters: {
    search?: string;
    status?: RunStatus;
  }): Promise<JobListItem[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.search) {
      conditions.push('(j.title LIKE ? OR IFNULL(j.description, "") LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.status) {
      conditions.push('lr.status = ?');
      params.push(filters.status);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await allAsync<any>(
      `
      SELECT
        j.*,
        lr.status AS latest_run_status,
        COALESCE(lr.started_at, lr.created_at) AS latest_run_at
      FROM jobs j
      LEFT JOIN runs lr ON lr.id = (
        SELECT r.id
        FROM runs r
        WHERE r.job_id = j.id
        ORDER BY datetime(r.created_at) DESC, r.id DESC
        LIMIT 1
      )
      ${whereClause}
      ORDER BY datetime(j.updated_at) DESC, datetime(j.created_at) DESC
      `,
      params,
    );

    return rows.map((row) => ({
      ...mapJobRow(row),
      latest_run_status: row.latest_run_status ?? null,
      latest_run_at: row.latest_run_at ?? null,
    }));
  }
}

export class ShareTokenModel {
  static async create(data: {
    id: string;
    job_id: string;
    token: string;
    expires_at?: string | null;
    max_claims?: number | null;
  }): Promise<void> {
    await runAsync(
      `INSERT INTO share_tokens (
        id, job_id, token, expires_at, max_claims
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        data.id,
        data.job_id,
        data.token,
        data.expires_at ?? null,
        data.max_claims ?? null,
      ],
    );
  }

  static async findByToken(token: string): Promise<ShareToken | null> {
    const row = await getAsync<any>('SELECT * FROM share_tokens WHERE token = ?', [token]);
    return row ? mapShareTokenRow(row) : null;
  }

  static async listByJobId(jobId: string): Promise<ShareToken[]> {
    const rows = await allAsync<any>(
      `SELECT * FROM share_tokens WHERE job_id = ? ORDER BY datetime(created_at) DESC, id DESC`,
      [jobId],
    );
    return rows.map(mapShareTokenRow);
  }

  static async incrementClaim(tokenId: string): Promise<void> {
    await runAsync(
      `
      UPDATE share_tokens
      SET
        claim_count = claim_count + 1,
        last_claimed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [tokenId],
    );
  }

  static async revoke(tokenId: string): Promise<void> {
    await runAsync(
      `
      UPDATE share_tokens
      SET revoked = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [tokenId],
    );
  }
}

export class RunModel {
  static async create(data: {
    id: string;
    job_id: string;
    share_token_id: string;
    config_snapshot: RunConfigSnapshot;
  }): Promise<void> {
    await runAsync(
      `INSERT INTO runs (
        id, job_id, share_token_id, status, config_snapshot
      ) VALUES (?, ?, ?, 'created', ?)`,
      [data.id, data.job_id, data.share_token_id, JSON.stringify(data.config_snapshot)],
    );
  }

  static async findById(id: string): Promise<Run | null> {
    const row = await getAsync<any>('SELECT * FROM runs WHERE id = ?', [id]);
    return row ? mapRunRow(row) : null;
  }

  static async listByJobId(jobId: string): Promise<Run[]> {
    const rows = await allAsync<any>(
      `SELECT * FROM runs WHERE job_id = ? ORDER BY datetime(created_at) DESC, id DESC`,
      [jobId],
    );
    return rows.map(mapRunRow);
  }

  static async markRunning(
    id: string,
    workerId: string,
    workerName?: string,
  ): Promise<void> {
    await runAsync(
      `
      UPDATE runs
      SET
        worker_id = ?,
        worker_name = COALESCE(?, worker_name),
        status = 'running',
        started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
        last_heartbeat_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [workerId, workerName ?? null, id],
    );
  }

  static async touchHeartbeat(id: string): Promise<void> {
    await runAsync(
      `
      UPDATE runs
      SET
        last_heartbeat_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [id],
    );
  }

  static async finish(
    id: string,
    status: Extract<RunStatus, 'finished' | 'failed' | 'cancelled' | 'lost'>,
    result?: string,
    metrics?: unknown,
  ): Promise<void> {
    await runAsync(
      `
      UPDATE runs
      SET
        status = ?,
        result = ?,
        metrics = ?,
        finished_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [status, result ?? null, metrics == null ? null : JSON.stringify(metrics), id],
    );
  }
}

export class LogModel {
  static async add(runId: string, message: string, level: LogLevel = 'info'): Promise<void> {
    await runAsync(
      `INSERT INTO logs (run_id, level, message) VALUES (?, ?, ?)`,
      [runId, level, message],
    );
  }

  static async listByRunId(runId: string): Promise<LogEntry[]> {
    return allAsync<LogEntry>(
      `SELECT * FROM logs WHERE run_id = ? ORDER BY id ASC`,
      [runId],
    );
  }
}

export class WorkerModel {
  static async upsertHeartbeat(data: {
    id: string;
    name: string;
    host?: string | null;
    current_run_id?: string | null;
    capabilities?: Record<string, unknown> | null;
    status: WorkerStatus;
  }): Promise<void> {
    await runAsync(
      `
      INSERT INTO workers (
        id, name, host, status, current_run_id, capabilities, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        host = excluded.host,
        status = excluded.status,
        current_run_id = excluded.current_run_id,
        capabilities = excluded.capabilities,
        last_seen_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      `,
      [
        data.id,
        data.name,
        data.host ?? null,
        data.status,
        data.current_run_id ?? null,
        data.capabilities ? JSON.stringify(data.capabilities) : null,
      ],
    );
  }

  static async release(workerId: string): Promise<void> {
    await runAsync(
      `
      UPDATE workers
      SET
        status = 'online',
        current_run_id = NULL,
        last_seen_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [workerId],
    );
  }

  static async findById(id: string): Promise<Worker | null> {
    const row = await getAsync<any>('SELECT * FROM workers WHERE id = ?', [id]);
    return row ? mapWorkerRow(row) : null;
  }

  static async list(): Promise<Worker[]> {
    const rows = await allAsync<any>(
      `SELECT * FROM workers ORDER BY datetime(last_seen_at) DESC, datetime(created_at) DESC`,
    );
    return rows.map(mapWorkerRow);
  }
}

export class RunArtifactModel {
  static async create(data: {
    id: string;
    run_id: string;
    filename: string;
    relative_path: string;
    size_bytes: number;
    storage_key: string;
    mime_type: string;
  }): Promise<void> {
    await runAsync(
      `
      INSERT INTO run_artifacts (
        id, run_id, filename, relative_path, size_bytes, storage_key, mime_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        data.id,
        data.run_id,
        data.filename,
        data.relative_path,
        data.size_bytes,
        data.storage_key,
        data.mime_type,
      ],
    );
  }

  static async listByRunId(runId: string): Promise<RunArtifact[]> {
    const rows = await allAsync<any>(
      `
      SELECT * FROM run_artifacts
      WHERE run_id = ?
      ORDER BY datetime(created_at) ASC, id ASC
      `,
      [runId],
    );

    return rows.map(mapRunArtifactRow);
  }
}