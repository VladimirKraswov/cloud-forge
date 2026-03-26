import { v4 as uuidv4 } from 'uuid';
import { JobModel, TokenModel } from '../models';
import { Job, JobStatus, LogEntry } from '../models/job';
import { QueueService } from './queue.service';

export class JobService {
  static async createJob(command: string = 'echo hello') {
    const id = `job_${uuidv4()}`;
    const token = `run_${uuidv4()}`;
    await JobModel.create(id, command);
    await TokenModel.create(token, id);

    // Add to BullMQ queue for processing
    try {
      await QueueService.addJob(id, command);
    } catch (err) {
      console.warn('Queue error (is Redis running?):', err);
    }

    return { id, token };
  }

  static async getJob(id: string): Promise<{ job: Job; logs: LogEntry[] } | null> {
    const job = await JobModel.findById(id);
    if (!job) return null;
    const logs = await JobModel.getLogs(id);
    return { job, logs };
  }

  static async claimJob(token: string) {
    const row = await TokenModel.findValidToken(token);
    if (!row) return null;

    const job = await JobModel.findById(row.job_id);
    if (!job) return null;

    await TokenModel.markAsUsed(token);
    await JobModel.updateStatus(job.id, 'running');

    return { job_id: job.id, command: job.command };
  }

  static async addLog(jobId: string, message: string) {
    await JobModel.addLog(jobId, message);
  }

  static async finishJob(
    jobId: string,
    status: JobStatus = 'finished',
    result?: string,
    metrics?: string,
  ) {
    await JobModel.updateStatus(jobId, status, result, metrics);
  }
}
