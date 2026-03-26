import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import jobsRoutes from '../../src/routes/jobs';
import workerRoutes from '../../src/routes/worker';
import { initDb } from '../../src/db/index';
import db from '../../src/db/index';

vi.mock('../../src/services/queue.service', () => ({
  QueueService: {
    addJob: vi.fn().mockResolvedValue(undefined),
  },
  getQueue: vi.fn(),
}));

vi.mock('../../src/routes/ws', () => ({
  broadcastJobStatus: vi.fn(),
  broadcastLog: vi.fn(),
  default: vi.fn().mockResolvedValue(undefined),
}));

describe('Integration Tests', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await initDb();
    await app.register(jobsRoutes);
    await app.register(workerRoutes);
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        db.run('DELETE FROM jobs', (err) => {
          if (err) return reject(err);
          db.run('DELETE FROM tokens', (err2) => {
            if (err2) return reject(err2);
            db.run('DELETE FROM logs', (err3) => {
              if (err3) return reject(err3);
              resolve();
            });
          });
        });
      });
    });
  });

  it('should create and claim a job', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/jobs',
      payload: {
        title: 'Integration test job',
        containers: [
          {
            name: 'bootstrap',
            image: 'python:3.11-slim',
            is_parent: true,
          },
        ],
        environments: {
          TEST_ENV: 'integration',
        },
        execution_code: 'print("integration test")',
        execution_language: 'python',
      },
    });

    expect(createRes.statusCode).toBe(201);

    const { job_id, run_token } = createRes.json() as {
      job_id: string;
      run_token: string;
    };

    const claimRes = await app.inject({
      method: 'POST',
      url: '/claim',
      payload: { token: run_token },
    });

    expect(claimRes.statusCode).toBe(200);

    const claimBody = claimRes.json() as {
      job_id: string;
      environments: Record<string, string>;
      execution_code: string;
    };

    expect(claimBody.job_id).toBe(job_id);
    expect(claimBody.environments.TEST_ENV).toBe('integration');
    expect(claimBody.execution_code).toContain('integration test');
  });
});