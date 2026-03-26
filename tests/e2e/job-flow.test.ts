import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { initDb } from '../../src/db/index';
import db from '../../src/db/index';
import jobsRoutes from '../../src/routes/jobs';
import workerRoutes from '../../src/routes/worker';

describe('E2E: Job Full Flow', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await initDb();

    await app.register(jobsRoutes);
    await app.register(workerRoutes);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      db.serialize(() => {
        db.run('DELETE FROM jobs', () => {});
        db.run('DELETE FROM tokens', () => {});
        db.run('DELETE FROM logs', () => resolve());
      });
    });
  });

  it('should create a job and successfully claim it', async () => {
    const createPayload = {
      title: 'E2E Full Flow Test',
      description: 'Проверка создания и claim job',
      containers: [
        {
          name: 'bootstrap',
          image: 'xproger/cloud-forge-bootstrap:latest',
          is_parent: true,
          resources: { gpus: 'all', shm_size: '8g' }
        }
      ],
      environments: {
        TEST_ENV: 'e2e_success_value'
      },
      execution_code: 'print("E2E test job started successfully")',
      execution_language: 'python'
    };

    const createRes = await app.inject({
      method: 'POST',
      url: '/jobs',
      payload: createPayload,
    });

    expect(createRes.statusCode).toBe(201);
    const { job_id, run_token } = createRes.json() as any;

    expect(job_id).toMatch(/^job_/);
    expect(run_token).toMatch(/^run_/);

    const claimRes = await app.inject({
      method: 'POST',
      url: '/claim',
      payload: { token: run_token },
    });

    expect(claimRes.statusCode, 'Claim should return 200').toBe(200);

    const claimBody = claimRes.json() as any;

    expect(claimBody.job_id).toBe(job_id);
    expect(Array.isArray(claimBody.containers)).toBe(true);
    expect(claimBody.execution_code).toBeDefined();
    expect(claimBody.environments.TEST_ENV).toBe('e2e_success_value');

    const bootstrap = claimBody.containers.find((c: any) => c.name === 'bootstrap');
    expect(bootstrap).toBeDefined();

    console.log(`✅ E2E test passed for job ${job_id}`);
  });

  it('should return 401 for invalid token', async () => {
    const claimRes = await app.inject({
      method: 'POST',
      url: '/claim',
      payload: { token: 'run_invalid_token_99999' },
    });

    expect(claimRes.statusCode).toBe(401);
  });
});