import sqlite3 from 'sqlite3';
import { config } from '../utils/config';

const db = new sqlite3.Database(config.databaseUrl);

const runAsync = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

export const initDb = async (): Promise<void> => {
  console.log('[DB] Starting database initialization...');

  await runAsync(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      owner_id TEXT,
      containers TEXT NOT NULL,
      environments TEXT NOT NULL,
      attached_files TEXT NOT NULL,
      execution_code TEXT NOT NULL,
      execution_language TEXT NOT NULL DEFAULT 'python',
      entrypoint TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

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

  await runAsync(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      share_token_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'created',
      worker_name TEXT,
      result TEXT,
      metrics TEXT,
      config_snapshot TEXT NOT NULL,
      started_at DATETIME,
      finished_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runAsync(`CREATE INDEX IF NOT EXISTS idx_share_tokens_job_id ON share_tokens(job_id)`);
  await runAsync(`CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON share_tokens(token)`);
  await runAsync(`CREATE INDEX IF NOT EXISTS idx_runs_job_id ON runs(job_id)`);
  await runAsync(`CREATE INDEX IF NOT EXISTS idx_runs_share_token_id ON runs(share_token_id)`);
  await runAsync(`CREATE INDEX IF NOT EXISTS idx_logs_run_id ON logs(run_id)`);

  console.log('[DB] Database initialized successfully');
};

export default db;