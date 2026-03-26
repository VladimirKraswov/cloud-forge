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
};