import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../utils/config';

// Ensure the directory for the database exists
const dbDir = path.dirname(config.databaseUrl);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(config.databaseUrl);

const runAsync = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

const allAsync = <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve((rows as T[]) || []);
    });
  });

type TableInfoRow = {
  cid: number;
  name: string;
  type: string;
  notnull: 0 | 1;
  dflt_value: string | null;
  pk: 0 | 1;
};

const getTableColumns = async (tableName: string): Promise<Set<string>> => {
  const rows = await allAsync<TableInfoRow>(`PRAGMA table_info(${tableName})`);
  return new Set(rows.map((row) => row.name));
};

const ensureColumn = async (
  tableName: string,
  columnName: string,
  columnSql: string,
): Promise<void> => {
  const columns = await getTableColumns(tableName);
  if (!columns.has(columnName)) {
    await runAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
  }
};

const renameTable = async (oldName: string, newName: string): Promise<void> => {
  const tables = await allAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    [oldName],
  );
  if (tables.length > 0) {
    const targetExists = await allAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [newName],
    );
    if (targetExists.length === 0) {
      console.log(`[DB] Renaming table ${oldName} to ${newName}`);
      await runAsync(`ALTER TABLE ${oldName} RENAME TO ${newName}`);
    }
  }
};

const renameColumn = async (
  tableName: string,
  oldColumn: string,
  newColumn: string,
): Promise<void> => {
  const columns = await getTableColumns(tableName);
  if (columns.has(oldColumn) && !columns.has(newColumn)) {
    console.log(`[DB] Renaming column ${oldColumn} to ${newColumn} in table ${tableName}`);
    await runAsync(`ALTER TABLE ${tableName} RENAME COLUMN ${oldColumn} TO ${newColumn}`);
  }
};

export const initDb = async (): Promise<void> => {
  console.log('[DB] Starting database initialization...');

  // Migrations for consistency
  await renameTable('custom_bootstrap_images', 'bootstrap_images');

  // Jobs
  await runAsync(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      owner_id TEXT,
      bootstrap_image_id TEXT,
      environment_variables TEXT NOT NULL DEFAULT '{}',
      resources_json TEXT,
      entrypoint TEXT NOT NULL,
      entrypoint_args TEXT NOT NULL DEFAULT '[]',
      working_dir TEXT NOT NULL DEFAULT '/workspace',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate older jobs table
  await renameColumn('jobs', 'resources', 'resources_json');
  await ensureColumn('jobs', 'bootstrap_image_id', 'bootstrap_image_id TEXT');
  await ensureColumn('jobs', 'environment_variables', `environment_variables TEXT NOT NULL DEFAULT '{}'`);
  await ensureColumn('jobs', 'resources_json', 'resources_json TEXT');
  await ensureColumn('jobs', 'entrypoint', `entrypoint TEXT NOT NULL DEFAULT 'main.py'`);
  await ensureColumn('jobs', 'entrypoint_args', `entrypoint_args TEXT NOT NULL DEFAULT '[]'`);
  await ensureColumn('jobs', 'working_dir', `working_dir TEXT NOT NULL DEFAULT '/workspace'`);

  // Share tokens
  await runAsync(`
    CREATE TABLE IF NOT EXISTS share_tokens (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME,
      max_claims INTEGER,
      claim_count INTEGER NOT NULL DEFAULT 0,
      revoked INTEGER NOT NULL DEFAULT 0,
      last_claimed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Workers
  await runAsync(`
    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT,
      status TEXT NOT NULL DEFAULT 'online',
      current_run_id TEXT,
      capabilities TEXT,
      last_seen_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Runs
  await runAsync(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      share_token_id TEXT NOT NULL,
      bootstrap_image_id TEXT,
      worker_id TEXT,
      status TEXT NOT NULL DEFAULT 'created',
      worker_name TEXT,
      result TEXT,
      metrics TEXT,
      run_manifest TEXT NOT NULL,
      stage TEXT,
      progress REAL,
      status_message TEXT,
      started_at DATETIME,
      finished_at DATETIME,
      last_heartbeat_at DATETIME,
      cancel_requested_at DATETIME,
      cancel_reason TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate older runs table
  await ensureColumn('runs', 'bootstrap_image_id', 'bootstrap_image_id TEXT');
  await ensureColumn('runs', 'run_manifest', `run_manifest TEXT NOT NULL DEFAULT '{}'`);
  await ensureColumn('runs', 'stage', 'stage TEXT');
  await ensureColumn('runs', 'progress', 'progress REAL');
  await ensureColumn('runs', 'status_message', 'status_message TEXT');

  // Logs
  await runAsync(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Run artifacts
  await runAsync(`
    CREATE TABLE IF NOT EXISTS run_artifacts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_key TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Bootstrap images
  await runAsync(`
    CREATE TABLE IF NOT EXISTS bootstrap_images (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_image TEXT NOT NULL,
      tag TEXT NOT NULL,
      dockerfile_text TEXT,
      environments_json TEXT NOT NULL DEFAULT '[]',
      runtime_resources_json TEXT,
      sdk_version TEXT,
      full_image_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      error TEXT,
      build_started_at DATETIME,
      build_finished_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate older bootstrap images table
  await ensureColumn('bootstrap_images', 'dockerfile_text', 'dockerfile_text TEXT');
  await ensureColumn(
    'bootstrap_images',
    'environments_json',
    `environments_json TEXT NOT NULL DEFAULT '[]'`,
  );
  await ensureColumn('bootstrap_images', 'runtime_resources_json', 'runtime_resources_json TEXT');
  await ensureColumn('bootstrap_images', 'sdk_version', 'sdk_version TEXT');
  await ensureColumn('bootstrap_images', 'build_started_at', 'build_started_at DATETIME');
  await ensureColumn('bootstrap_images', 'build_finished_at', 'build_finished_at DATETIME');

  // Some older versions used extra_packages; keep column if it exists, but no migration needed.

  // Bootstrap image logs
  await runAsync(`
    CREATE TABLE IF NOT EXISTS bootstrap_image_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_id TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Job files
  await runAsync(`
    CREATE TABLE IF NOT EXISTS job_files (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      filename TEXT NOT NULL,
      source_type TEXT NOT NULL,
      storage_key TEXT,
      inline_content TEXT,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      is_executable INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Run events
  await runAsync(`
    CREATE TABLE IF NOT EXISTS run_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      stage TEXT,
      progress REAL,
      message TEXT,
      level TEXT,
      payload TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Indexes
  await runAsync(`CREATE INDEX IF NOT EXISTS idx_jobs_bootstrap_image_id ON jobs(bootstrap_image_id)`);

  await runAsync(`CREATE INDEX IF NOT EXISTS idx_share_tokens_job_id ON share_tokens(job_id)`);
  await runAsync(`CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON share_tokens(token)`);

  await runAsync(`CREATE INDEX IF NOT EXISTS idx_runs_job_id ON runs(job_id)`);
  await runAsync(`CREATE INDEX IF NOT EXISTS idx_runs_share_token_id ON runs(share_token_id)`);
  await runAsync(`CREATE INDEX IF NOT EXISTS idx_runs_worker_id ON runs(worker_id)`);
  await runAsync(`CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status)`);
  await runAsync(`CREATE INDEX IF NOT EXISTS idx_runs_last_heartbeat_at ON runs(last_heartbeat_at)`);
  await runAsync(`CREATE INDEX IF NOT EXISTS idx_runs_bootstrap_image_id ON runs(bootstrap_image_id)`);

  await runAsync(`CREATE INDEX IF NOT EXISTS idx_logs_run_id ON logs(run_id)`);
  await runAsync(`CREATE INDEX IF NOT EXISTS idx_workers_last_seen_at ON workers(last_seen_at)`);
  await runAsync(`CREATE INDEX IF NOT EXISTS idx_run_artifacts_run_id ON run_artifacts(run_id)`);

  await runAsync(`CREATE INDEX IF NOT EXISTS idx_bootstrap_image_logs_image_id ON bootstrap_image_logs(image_id)`);

  await runAsync(`CREATE INDEX IF NOT EXISTS idx_job_files_job_id ON job_files(job_id)`);
  await runAsync(`CREATE UNIQUE INDEX IF NOT EXISTS idx_job_files_job_path ON job_files(job_id, relative_path)`);

  await runAsync(`CREATE INDEX IF NOT EXISTS idx_run_events_run_id ON run_events(run_id)`);

  console.log('[DB] Database initialized successfully');
};

export default db;