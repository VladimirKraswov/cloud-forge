import db from '../db/index';
import { JobModel, RunModel, WorkerModel } from '../models';
import { JobListItem, Run, Worker } from '../models/job';
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

export class DashboardService {
  static async getSummary() {
    const stats = await getAsync<any>(`
      SELECT
        (SELECT COUNT(*) FROM jobs) as total_jobs,
        (SELECT COUNT(*) FROM runs) as total_runs,
        (SELECT COUNT(*) FROM runs WHERE status = 'created') as created_runs,
        (SELECT COUNT(*) FROM runs WHERE status = 'running') as running_runs,
        (SELECT COUNT(*) FROM runs WHERE status = 'finished') as finished_runs,
        (SELECT COUNT(*) FROM runs WHERE status = 'failed') as failed_runs,
        (SELECT COUNT(*) FROM runs WHERE status = 'cancelled') as cancelled_runs,
        (SELECT COUNT(*) FROM runs WHERE status = 'lost') as lost_runs
    `);

    const workers = await JobService.listWorkers();
    const active_workers = workers.filter((w) => w.status !== 'offline').length;
    const offline_workers = workers.filter((w) => w.status === 'offline').length;

    return {
      total_jobs: stats.total_jobs,
      total_runs: stats.total_runs,
      active_runs: stats.created_runs + stats.running_runs,
      finished_runs: stats.finished_runs,
      failed_runs: stats.failed_runs,
      cancelled_runs: stats.cancelled_runs,
      lost_runs: stats.lost_runs,
      active_workers,
      offline_workers,
    };
  }

  static async getActiveRuns() {
    const rows = await allAsync<any>(`
      SELECT
        r.*,
        j.title as job_title
      FROM runs r
      JOIN jobs j ON r.job_id = j.id
      WHERE r.status IN ('created', 'running')
      ORDER BY datetime(r.created_at) DESC
    `);

    return rows;
  }

  static async getActiveWorkers() {
    const workers = await JobService.listWorkers();
    return workers.filter((w) => w.status !== 'offline');
  }

  static async getRecentEvents() {
    // Recent finished/failed/cancelled runs as events
    const rows = await allAsync<any>(`
      SELECT
        r.id as run_id,
        r.job_id,
        j.title as job_title,
        r.status,
        r.updated_at as timestamp
      FROM runs r
      JOIN jobs j ON r.job_id = j.id
      WHERE r.status NOT IN ('created', 'running')
      ORDER BY datetime(r.updated_at) DESC
      LIMIT 20
    `);

    return rows;
  }
}
