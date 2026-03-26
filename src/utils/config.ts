import dotenv from 'dotenv';

dotenv.config();

const normalizeBaseUrl = (value?: string): string | undefined => {
  if (!value) return undefined;
  return value.replace(/\/+$/, '');
};

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'db.sqlite',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  minioEndpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  minioAccessKey: process.env.MINIO_ACCESS_KEY || 'cloudforge',
  minioSecretKey: process.env.MINIO_SECRET_KEY || 'cloudforge123',
  minioBucket: process.env.MINIO_BUCKET || 'cloud-forge',
  publicBaseUrl: normalizeBaseUrl(process.env.PUBLIC_BASE_URL),
  workerHeartbeatIntervalSeconds: parseInt(
    process.env.WORKER_HEARTBEAT_INTERVAL_SECONDS || '10',
    10,
  ),
  workerOfflineTimeoutSeconds: parseInt(
    process.env.WORKER_OFFLINE_TIMEOUT_SECONDS || '45',
    10,
  ),
  runWatchdogIntervalSeconds: parseInt(
    process.env.RUN_WATCHDOG_INTERVAL_SECONDS || '10',
    10,
  ),
  publishedWorkerImage: process.env.PUBLISHED_WORKER_IMAGE || 'cloudforge/worker',
  publishedWorkerTag: process.env.PUBLISHED_WORKER_TAG || 'latest',
};