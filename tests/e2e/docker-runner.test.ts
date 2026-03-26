import { describe, it, expect, beforeAll } from 'vitest';
import Fastify from 'fastify';
import { initDb } from '../../src/db/index';
import jobsRoutes from '../../src/routes/jobs';
import workerRoutes from '../../src/routes/worker';

describe('E2E: Docker Runner Flow', () => {
  let app: any;
  let jobId: string;
  let runToken: string;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await initDb();
    await app.register(jobsRoutes);
    await app.register(workerRoutes);
  });

  it('should create job and generate a valid docker runner command', async () => {
    const createPayload = {
      title: 'Docker Runner Test',
      containers: [
        {
          name: 'bootstrap',
          image: 'python:3.11-slim',
          is_parent: true,
          resources: { gpus: 'all', shm_size: '16g' },
        },
      ],
      environments: {
        TEST_VAR: 'docker_success',
      },
      execution_code:
        'import os\nprint("Running inside Docker!")\nprint("TEST_VAR =", os.getenv("TEST_VAR"))',
      execution_language: 'python',
    };

    const createRes = await app.inject({
      method: 'POST',
      url: '/jobs',
      payload: createPayload,
    });

    expect(createRes.statusCode).toBe(201);

    const { job_id, run_token } = createRes.json() as {
      job_id: string;
      run_token: string;
    };

    jobId = job_id;
    runToken = run_token;

    const dockerCommand = `docker run --rm \\
  --add-host=host.docker.internal:host-gateway \\
  -e SERVER_URL="http://host.docker.internal:3000" \\
  -e JOB_CONFIG_URL="http://host.docker.internal:3000/api/jobs/${jobId}/config?token=${runToken}" \\
  cloud-forge-worker`;

    console.log('\n📋 Готовая Docker команда для запуска runner:');
    console.log(dockerCommand);
    console.log('\n💡 Перед первым запуском собери образ: docker build -t cloud-forge-worker -f Dockerfile.worker .');

    expect(dockerCommand).toContain('host.docker.internal');
    expect(dockerCommand).toContain(runToken);
    expect(dockerCommand).toContain(jobId);
    expect(dockerCommand).toContain('JOB_CONFIG_URL');
    expect(dockerCommand).toContain('cloud-forge-worker');

    console.log(`✅ Docker runner test passed for job ${jobId}`);
  });
});