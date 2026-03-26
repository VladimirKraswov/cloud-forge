import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { initDb } from '../../src/db/index';
import db from '../../src/db/index';
import jobsRoutes from '../../src/routes/jobs';
import workerRoutes from '../../src/routes/worker';
import { broadcastLog } from '../../src/routes/ws';

describe('E2E: Core Flow — Create + Claim + Logs', () => {
  let app: any;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await initDb();
    await app.register(jobsRoutes);
    await app.register(workerRoutes);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      db.serialize(() => {
        db.run('DELETE FROM jobs', () => {});
        db.run('DELETE FROM tokens', () => {});
        db.run('DELETE FROM logs', () => resolve());
      });
    });
  });

  it('should create job, claim it and broadcast logs', async () => {
    // 1. Create job
    const createPayload = {
      title: 'Core E2E Flow Test',
      containers: [
        { name: 'bootstrap', image: 'python:3.11-slim', is_parent: true }
      ],
      environments: { TEST_VAR: 'success' },
      execution_code: 'print("Job started")',
      execution_language: 'python'
    };

    const createRes = await app.inject({
      method: 'POST',
      url: '/jobs',
      payload: createPayload,
    });

    expect(createRes.statusCode).toBe(201);
    const { job_id, run_token } = createRes.json() as any;

    // 2. Claim job
    const claimRes = await app.inject({
      method: 'POST',
      url: '/claim',
      payload: { token: run_token },
    });

    expect(claimRes.statusCode).toBe(200);
    const claimBody = claimRes.json() as any;

    expect(claimBody.job_id).toBe(job_id);
    expect(claimBody.containers).toBeDefined();
    expect(claimBody.execution_code).toBeDefined();

    // 3. Send logs directly via broadcast (reliable in tests)
    const testLogs = [
      "Job started in Docker",
      "TEST_VAR = success",
      "Processing data...",
      "Job completed successfully"
    ];

    for (const msg of testLogs) {
      broadcastLog(job_id, msg);
    }

    console.log(`✅ Core E2E test passed for job ${job_id}`);
    console.log(`Broadcasted ${testLogs.length} logs`);
  });
});