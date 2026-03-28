import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../utils/config';

let connection: IORedis | null = null;
let jobQueue: Queue | null = null;

export const getQueue = () => {
  if (!jobQueue) {
    if (!connection) {
      connection = new IORedis(config.redisUrl, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });
    }
    jobQueue = new Queue('job-queue', { connection });
  }
  return jobQueue;
};

export const initWorker = () => {
  if (!connection) {
    connection = new IORedis(config.redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }
  const worker = new Worker(
    'job-queue',
    async (job: Job) => {
      console.log(`Processing job ${job.id}: ${job.data.command}`);
    },
    { connection },
  );

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed with ${err.message}`);
  });

  return worker;
};

export class QueueService {
  static async addJob(jobId: string, command: string) {
    const queue = getQueue();
    await queue.add('execute-command', { jobId, command }, { jobId });
  }
}
