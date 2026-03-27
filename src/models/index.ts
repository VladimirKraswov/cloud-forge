import db from '../db/index';
import {
  BootstrapImage,
  Job,
  JobFile,
  JobListItem,
  LogEntry,
  LogLevel,
  Run,
  RunArtifact,
  RunEvent,
  RunManifest,
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

const mapBootstrapImageRow = (row: any): BootstrapImage => ({
  id: row.id,
  name: row.name,
  base_image: row.base_image,
  tag: row.tag,
  full_image_name: row.full_image_name,
  dockerfile_text: row.dockerfile_text,
  environments: parseJson(row.environments_json, []),
  runtime_resources: parseJson(row.runtime_resources_json, null),
  sdk_version: row.sdk_version ?? null,
  status: row.status,
  error: row.error ?? null,
  build_started_at: row.build_started_at ?? null,
  build_finished_at: row.build_finished_at ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const mapJobRow = (row: any): Job => ({
  id: row.id,
  title: row.title,
  description: row.description ?? null,
  owner_id: row.owner_id ?? null,
  bootstrap_image_id: row.bootstrap_image_id,
  environment_variables: parseJson(row.environment_variables, {}),
  resources: parseJson(row.resources_json, null),
  entrypoint: row.entrypoint,
  entrypoint_args: parseJson(row.entrypoint_args, []),
  working_dir: row.working_dir ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const mapJobFileRow = (row: any): JobFile => ({
  id: row.id,
  job_id: row.job_id,
  relative_path: row.relative_path,
  filename: row.filename,
  source_type: row.source_type,
  storage_key: row.storage_key ?? null,
  inline_content: row.inline_content ?? null,
  mime_type: row.mime_type,
  size_bytes: row.size_bytes,
  is_executable: Boolean(row.is_executable),
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const mapRunRow = (row: any): Run => ({
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
  run_manifest: parseJson<RunManifest>(row.run_manifest, {
    run_id: row.id,
    job_id: row.job_id,
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
  }),
  started_at: row.started_at ?? null,
  finished_at: row.finished_at ?? null,
  last_heartbeat_at: row.last_heartbeat_at ?? null,
  cancel_requested_at: row.cancel_requested_at ?? null,
  cancel_reason: row.cancel_reason ?? null,
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

const mapRunEventRow = (row: any): RunEvent => ({
  id: row.id,
  run_id: row.run_id,
  type: row.type,
  stage: row.stage ?? null,
  progress: row.progress ?? null,
  message: row.message ?? null,
  level: row.level ?? null,
  payload: parseJson(row.payload, null),
  created_at: row.created_at,
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

export class BootstrapImageModel {
  static async create(data: {
    id: string;
    name: string;
    base_image: string;
    tag: string;
    full_image_name: string;
    dockerfile_text: string;
    environments: BootstrapImage['environments'];
    runtime_resources?: BootstrapImage['runtime_resources'];
    sdk_version?: string | null;
    status: BootstrapImage['status'];
    error?: string | null;
  }): Promise<void> {
    await runAsync(
      `
      INSERT INTO bootstrap_images (
        id, name, base_image, tag, full_image_name, dockerfile_text,
        environments_json, runtime_resources_json, sdk_version, status, error, build_started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [
        data.id,
        data.name,
        data.base_image,
        data.tag,
        data.full_image_name,
        data.dockerfile_text,
        JSON.stringify(data.environments || []),
        JSON.stringify(data.runtime_resources || {}),
        data.sdk_version ?? null,
        data.status,
        data.error ?? null,
      ],
    );
  }

  static async update(
    id: string,
    patch: Partial<{
      full_image_name: string;
      dockerfile_text: string;
      environments: BootstrapImage['environments'];
      runtime_resources: BootstrapImage['runtime_resources'];
      status: BootstrapImage['status'];
      error: string | null;
      build_finished_at: string | null;
    }>,
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (patch.full_image_name !== undefined) {
      sets.push('full_image_name = ?');
      params.push(patch.full_image_name);
    }
    if (patch.dockerfile_text !== undefined) {
      sets.push('dockerfile_text = ?');
      params.push(patch.dockerfile_text);
    }
    if (patch.environments !== undefined) {
      sets.push('environments_json = ?');
      params.push(JSON.stringify(patch.environments));
    }
    if (patch.runtime_resources !== undefined) {
      sets.push('runtime_resources_json = ?');
      params.push(JSON.stringify(patch.runtime_resources || {}));
    }
    if (patch.status !== undefined) {
      sets.push('status = ?');
      params.push(patch.status);
    }
    if (patch.error !== undefined) {
      sets.push('error = ?');
      params.push(patch.error);
    }
    if (patch.build_finished_at !== undefined) {
      sets.push('build_finished_at = ?');
      params.push(patch.build_finished_at);
    }

    if (!sets.length) return;

    sets.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await runAsync(`UPDATE bootstrap_images SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  static async findById(id: string): Promise<BootstrapImage | null> {
    const row = await getAsync<any>('SELECT * FROM bootstrap_images WHERE id = ?', [id]);
    return row ? mapBootstrapImageRow(row) : null;
  }

  static async findCompletedByName(name: string): Promise<BootstrapImage | null> {
    const row = await getAsync<any>(
      `SELECT * FROM bootstrap_images WHERE name = ? AND status = 'completed' ORDER BY datetime(created_at) DESC LIMIT 1`,
      [name],
    );
    return row ? mapBootstrapImageRow(row) : null;
  }

  static async list(options?: { status?: BootstrapImage['status'] }): Promise<BootstrapImage[]> {
    const params: unknown[] = [];
    let where = '';

    if (options?.status) {
      where = 'WHERE status = ?';
      params.push(options.status);
    }

    const rows = await allAsync<any>(
      `SELECT * FROM bootstrap_images ${where} ORDER BY datetime(created_at) DESC, id DESC`,
      params,
    );
    return rows.map(mapBootstrapImageRow);
  }
}

export class BootstrapImageLogModel {
  static async add(
    imageId: string,
    message: string,
    level: LogLevel = 'info',
  ): Promise<void> {
    await runAsync(
      `INSERT INTO bootstrap_image_logs (image_id, level, message) VALUES (?, ?, ?)`,
      [imageId, level, message],
    );
  }

  static async listByImageId(imageId: string): Promise<Array<{
    id: number;
    image_id: string;
    level: LogLevel;
    message: string;
    created_at: string;
  }>> {
    return allAsync(
      `SELECT id, image_id, level, message, created_at FROM bootstrap_image_logs WHERE image_id = ? ORDER BY id ASC`,
      [imageId],
    );
  }
}

export class JobModel {
  static async create(data: {
    id: string;
    title: string;
    description?: string | null;
    owner_id?: string | null;
    bootstrap_image_id: string;
    environment_variables?: Record<string, string>;
    resources?: Job['resources'];
    entrypoint: string;
    entrypoint_args?: string[];
    working_dir?: string | null;
  }): Promise<void> {
    await runAsync(
      `
      INSERT INTO jobs (
        id, title, description, owner_id, bootstrap_image_id,
        environment_variables, resources_json, entrypoint, entrypoint_args, working_dir
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        data.id,
        data.title,
        data.description ?? null,
        data.owner_id ?? null,
        data.bootstrap_image_id,
        JSON.stringify(data.environment_variables || {}),
        JSON.stringify(data.resources || {}),
        data.entrypoint,
        JSON.stringify(data.entrypoint_args || []),
        data.working_dir ?? null,
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
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: JobListItem[]; total: number }> {
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

    const countRow = await getAsync<{ total: number }>(
      `
      SELECT COUNT(*) as total
      FROM jobs j
      LEFT JOIN runs lr ON lr.id = (
        SELECT r.id
        FROM runs r
        WHERE r.job_id = j.id
        ORDER BY datetime(r.created_at) DESC, r.id DESC
        LIMIT 1
      )
      ${whereClause}
      `,
      params,
    );

    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    const rows = await allAsync<any>(
      `
      SELECT
        j.*,
        bi.name AS bootstrap_image_name,
        bi.full_image_name AS bootstrap_full_image_name,
        lr.status AS latest_run_status,
        COALESCE(lr.started_at, lr.created_at) AS latest_run_at,
        (SELECT COUNT(*) FROM runs WHERE job_id = j.id) as runs_count,
        (SELECT COUNT(*) FROM runs WHERE job_id = j.id AND status IN ('created', 'running')) as active_runs_count
      FROM jobs j
      JOIN bootstrap_images bi ON bi.id = j.bootstrap_image_id
      LEFT JOIN runs lr ON lr.id = (
        SELECT r.id
        FROM runs r
        WHERE r.job_id = j.id
        ORDER BY datetime(r.created_at) DESC, r.id DESC
        LIMIT 1
      )
      ${whereClause}
      ORDER BY datetime(j.updated_at) DESC, datetime(j.created_at) DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    const jobs = rows.map((row) => ({
      ...mapJobRow(row),
      bootstrap_image_name: row.bootstrap_image_name ?? null,
      bootstrap_full_image_name: row.bootstrap_full_image_name ?? null,
      latest_run_status: row.latest_run_status ?? null,
      latest_run_at: row.latest_run_at ?? null,
      runs_count: row.runs_count ?? 0,
      active_runs_count: row.active_runs_count ?? 0,
    }));

    return {
      jobs,
      total: countRow?.total ?? 0,
    };
  }

  static async update(id: string, patch: Partial<Job>): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];

    const rawFields: Array<[string, keyof Job]> = [
      ['title', 'title'],
      ['description', 'description'],
      ['owner_id', 'owner_id'],
      ['bootstrap_image_id', 'bootstrap_image_id'],
      ['entrypoint', 'entrypoint'],
      ['working_dir', 'working_dir'],
    ];

    for (const [column, key] of rawFields) {
      if (patch[key] !== undefined) {
        sets.push(`${column} = ?`);
        params.push(patch[key] as unknown);
      }
    }

    if (patch.environment_variables !== undefined) {
      sets.push('environment_variables = ?');
      params.push(JSON.stringify(patch.environment_variables || {}));
    }

    if (patch.resources !== undefined) {
      sets.push('resources_json = ?');
      params.push(JSON.stringify(patch.resources || {}));
    }

    if (patch.entrypoint_args !== undefined) {
      sets.push('entrypoint_args = ?');
      params.push(JSON.stringify(patch.entrypoint_args || []));
    }

    if (!sets.length) return;

    sets.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    await runAsync(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  static async delete(id: string): Promise<void> {
    await runAsync('DELETE FROM jobs WHERE id = ?', [id]);
  }
}

export class JobFileModel {
  static async upsertInline(data: {
    id: string;
    job_id: string;
    relative_path: string;
    filename: string;
    inline_content: string;
    mime_type: string;
    is_executable: boolean;
  }): Promise<void> {
    await runAsync(
      `
      INSERT INTO job_files (
        id, job_id, relative_path, filename, source_type, storage_key, inline_content,
        mime_type, size_bytes, is_executable
      ) VALUES (?, ?, ?, ?, 'inline', NULL, ?, ?, ?, ?)
      ON CONFLICT(job_id, relative_path) DO UPDATE SET
        filename = excluded.filename,
        source_type = 'inline',
        storage_key = NULL,
        inline_content = excluded.inline_content,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        is_executable = excluded.is_executable,
        updated_at = CURRENT_TIMESTAMP
      `,
      [
        data.id,
        data.job_id,
        data.relative_path,
        data.filename,
        data.inline_content,
        data.mime_type,
        Buffer.byteLength(data.inline_content, 'utf8'),
        data.is_executable ? 1 : 0,
      ],
    );
  }

  static async upsertUploaded(data: {
    id: string;
    job_id: string;
    relative_path: string;
    filename: string;
    storage_key: string;
    mime_type: string;
    size_bytes: number;
    is_executable: boolean;
  }): Promise<void> {
    await runAsync(
      `
      INSERT INTO job_files (
        id, job_id, relative_path, filename, source_type, storage_key, inline_content,
        mime_type, size_bytes, is_executable
      ) VALUES (?, ?, ?, ?, 'upload', ?, NULL, ?, ?, ?)
      ON CONFLICT(job_id, relative_path) DO UPDATE SET
        filename = excluded.filename,
        source_type = 'upload',
        storage_key = excluded.storage_key,
        inline_content = NULL,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        is_executable = excluded.is_executable,
        updated_at = CURRENT_TIMESTAMP
      `,
      [
        data.id,
        data.job_id,
        data.relative_path,
        data.filename,
        data.storage_key,
        data.mime_type,
        data.size_bytes,
        data.is_executable ? 1 : 0,
      ],
    );
  }

  static async findByJobIdAndPath(jobId: string, relativePath: string): Promise<JobFile | null> {
    const row = await getAsync<any>(
      `SELECT * FROM job_files WHERE job_id = ? AND relative_path = ?`,
      [jobId, relativePath],
    );
    return row ? mapJobFileRow(row) : null;
  }

  static async listByJobId(jobId: string): Promise<JobFile[]> {
    const rows = await allAsync<any>(
      `SELECT * FROM job_files WHERE job_id = ? ORDER BY relative_path ASC`,
      [jobId],
    );
    return rows.map(mapJobFileRow);
  }

  static async deleteByJobIdAndPath(jobId: string, relativePath: string): Promise<void> {
    await runAsync(`DELETE FROM job_files WHERE job_id = ? AND relative_path = ?`, [
      jobId,
      relativePath,
    ]);
  }

  static async deleteByJobId(jobId: string): Promise<void> {
    await runAsync(`DELETE FROM job_files WHERE job_id = ?`, [jobId]);
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
      `
      INSERT INTO share_tokens (
        id, job_id, token, expires_at, max_claims
      ) VALUES (?, ?, ?, ?, ?)
      `,
      [data.id, data.job_id, data.token, data.expires_at ?? null, data.max_claims ?? null],
    );
  }

  static async findByToken(token: string): Promise<ShareToken | null> {
    const row = await getAsync<any>('SELECT * FROM share_tokens WHERE token = ?', [token]);
    return row ? mapShareTokenRow(row) : null;
  }

  static async findById(id: string): Promise<ShareToken | null> {
    const row = await getAsync<any>('SELECT * FROM share_tokens WHERE id = ?', [id]);
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
      SET claim_count = claim_count + 1,
          last_claimed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [tokenId],
    );
  }

  static async revoke(tokenId: string): Promise<void> {
    await runAsync(
      `UPDATE share_tokens SET revoked = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [tokenId],
    );
  }
}

export class RunModel {
  static async create(data: {
    id: string;
    job_id: string;
    share_token_id: string;
    bootstrap_image_id: string;
    run_manifest: RunManifest;
  }): Promise<void> {
    await runAsync(
      `
      INSERT INTO runs (
        id, job_id, share_token_id, bootstrap_image_id, status, run_manifest
      ) VALUES (?, ?, ?, ?, 'created', ?)
      `,
      [
        data.id,
        data.job_id,
        data.share_token_id,
        data.bootstrap_image_id,
        JSON.stringify(data.run_manifest),
      ],
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

  static async listByJobIdPaginated(jobId: string, limit: number, offset: number): Promise<Run[]> {
    const rows = await allAsync<any>(
      `SELECT * FROM runs WHERE job_id = ? ORDER BY datetime(created_at) DESC, id DESC LIMIT ? OFFSET ?`,
      [jobId, limit, offset],
    );
    return rows.map(mapRunRow);
  }

  static async countByJobId(jobId: string): Promise<number> {
    const row = await getAsync<{ total: number }>(
      `SELECT COUNT(*) as total FROM runs WHERE job_id = ?`,
      [jobId],
    );
    return row?.total ?? 0;
  }

  static async countActiveByJobId(jobId: string): Promise<number> {
    const row = await getAsync<{ total: number }>(
      `SELECT COUNT(*) as total FROM runs WHERE job_id = ? AND status IN ('created', 'running')`,
      [jobId],
    );
    return row?.total ?? 0;
  }

  static async markRunning(id: string, workerId: string, workerName?: string): Promise<void> {
    await runAsync(
      `
      UPDATE runs
      SET worker_id = ?,
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
      `UPDATE runs SET last_heartbeat_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id],
    );
  }

  static async requestCancel(id: string, reason?: string): Promise<void> {
    await runAsync(
      `
      UPDATE runs
      SET cancel_requested_at = COALESCE(cancel_requested_at, CURRENT_TIMESTAMP),
          cancel_reason = COALESCE(?, cancel_reason),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [reason ?? 'Run cancelled by user', id],
    );
  }

  static async updateProgress(data: {
    id: string;
    stage?: string | null;
    progress?: number | null;
    status_message?: string | null;
    metrics?: unknown;
  }): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (data.stage !== undefined) {
      sets.push('stage = ?');
      params.push(data.stage);
    }
    if (data.progress !== undefined) {
      sets.push('progress = ?');
      params.push(data.progress);
    }
    if (data.status_message !== undefined) {
      sets.push('status_message = ?');
      params.push(data.status_message);
    }
    if (data.metrics !== undefined) {
      sets.push('metrics = ?');
      params.push(data.metrics == null ? null : JSON.stringify(data.metrics));
    }

    if (!sets.length) return;

    sets.push('updated_at = CURRENT_TIMESTAMP');
    params.push(data.id);

    await runAsync(`UPDATE runs SET ${sets.join(', ')} WHERE id = ?`, params);
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
      SET status = ?,
          result = ?,
          metrics = ?,
          finished_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [status, result ?? null, metrics == null ? null : JSON.stringify(metrics), id],
    );
  }

  static async listStaleRuns(cutoffIso: string): Promise<Run[]> {
    const rows = await allAsync<any>(
      `
      SELECT *
      FROM runs
      WHERE status IN ('created', 'running')
        AND datetime(COALESCE(last_heartbeat_at, started_at, created_at)) < datetime(?)
      ORDER BY datetime(COALESCE(last_heartbeat_at, started_at, created_at)) ASC
      `,
      [cutoffIso],
    );
    return rows.map(mapRunRow);
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
    return allAsync<LogEntry>(`SELECT * FROM logs WHERE run_id = ? ORDER BY id ASC`, [runId]);
  }
}

export class RunEventModel {
  static async create(data: {
    id: string;
    run_id: string;
    type: RunEvent['type'];
    stage?: string | null;
    progress?: number | null;
    message?: string | null;
    level?: LogLevel | null;
    payload?: Record<string, unknown> | null;
  }): Promise<void> {
    await runAsync(
      `
      INSERT INTO run_events (
        id, run_id, type, stage, progress, message, level, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        data.id,
        data.run_id,
        data.type,
        data.stage ?? null,
        data.progress ?? null,
        data.message ?? null,
        data.level ?? null,
        data.payload == null ? null : JSON.stringify(data.payload),
      ],
    );
  }

  static async listByRunId(runId: string): Promise<RunEvent[]> {
    const rows = await allAsync<any>(
      `SELECT * FROM run_events WHERE run_id = ? ORDER BY datetime(created_at) ASC, id ASC`,
      [runId],
    );
    return rows.map(mapRunEventRow);
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
      SET status = 'online',
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
      `SELECT * FROM run_artifacts WHERE run_id = ? ORDER BY datetime(created_at) ASC, id ASC`,
      [runId],
    );
    return rows.map(mapRunArtifactRow);
  }
}
