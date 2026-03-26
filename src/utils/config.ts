import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'db.sqlite',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
};
