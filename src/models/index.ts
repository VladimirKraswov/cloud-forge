import { Job, JobStatus, LogEntry } from './job';
import db from '../db/index';

export class JobModel {
  static create(id: string, command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO jobs (id, status, command) VALUES (?, ?, ?)',
        [id, 'pending', command],
        (err) => {
          if (err) return reject(err);
          resolve();
        },
      );
    });
  }

  static findById(id: string): Promise<Job | null> {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM jobs WHERE id = ?', [id], (err, row) => {
        if (err) return reject(err);
        resolve((row as Job) || null);
      });
    });
  }

  static updateStatus(
    id: string,
    status: JobStatus,
    result?: string,
    metrics?: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE jobs SET status = ?, result = ?, metrics = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, result || null, metrics || null, id],
        (err) => {
          if (err) return reject(err);
          resolve();
        },
      );
    });
  }

  static getLogs(jobId: string): Promise<LogEntry[]> {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM logs WHERE job_id = ? ORDER BY id ASC', [jobId], (err, rows) => {
        if (err) return reject(err);
        resolve(rows as LogEntry[]);
      });
    });
  }

  static addLog(jobId: string, message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run('INSERT INTO logs (job_id, message) VALUES (?, ?)', [jobId, message], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
}

export class TokenModel {
  static create(token: string, jobId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run('INSERT INTO tokens (token, job_id) VALUES (?, ?)', [token, jobId], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  static findValidToken(token: string): Promise<{ job_id: string } | null> {
    return new Promise((resolve, reject) => {
      db.get('SELECT job_id FROM tokens WHERE token = ? AND used = 0', [token], (err, row) => {
        if (err) return reject(err);
        resolve((row as { job_id: string }) || null);
      });
    });
  }

  static markAsUsed(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run('UPDATE tokens SET used = 1 WHERE token = ?', [token], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
}
