import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { initDb } from '../../src/db/index';
import db from '../../src/db/index';
import jobsRoutes from '../../src/routes/jobs';
import workerRoutes from '../../src/routes/worker';
import artifactsRoutes from '../../src/routes/artifacts';

// Mock ArtifactService to avoid real MinIO calls in this e2e test
vi.mock('../../src/services/artifact.service', () => ({
  ArtifactService: {
    ensureBucket: vi.fn().mockResolvedValue(undefined),
    uploadRunArtifact: vi.fn().mockResolvedValue({
      id: 'mock_artifact_id',
      filename: 'output.txt',
      relative_path: 'output.txt',
      size_bytes: 14,
      storage_key: 'runs/run_id/artifacts/mock_artifact_id/output.txt',
    }),
    getDownloadUrl: vi.fn().mockResolvedValue('http://mock-minio/download'),
    uploadJobFile: vi.fn(),
  },
}));

describe('Smoke E2E: Full Job & Run Lifecycle', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await initDb();

    await app.register(fastifyMultipart);
    await app.register(jobsRoutes);
    await app.register(workerRoutes);
    await app.register(artifactsRoutes);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      db.serialize(() => {
        db.run('DELETE FROM jobs', () => {});
        db.run('DELETE FROM share_tokens', () => {});
        db.run('DELETE FROM runs', () => {});
        db.run('DELETE FROM logs', () => {});
        db.run('DELETE FROM run_artifacts', () => {});
        db.run('DELETE FROM workers', () => resolve());
      });
    });
  });

  it('should complete the full happy path flow', async () => {
    // 1. Setup a dummy bootstrap image
    const bootstrap_id = 'img_smoke_test';
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO bootstrap_images (id, name, base_image, tag, full_image_name, dockerfile_text, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [bootstrap_id, 'Smoke Image', 'node:20-slim', 'latest', 'node:20-slim', 'FROM node:20-slim', 'completed'],
        (err) => (err ? reject(err) : resolve()),
      );
    });

    const validateRes = await app.inject({
      method: 'POST',
      url: '/jobs/validate',
      payload: {
        title: 'Smoke Test Job',
        bootstrap_image_id: bootstrap_id,
        entrypoint: 'main.js',
      },
    });

    expect(validateRes.statusCode).toBe(200);
    expect(validateRes.json().valid).toBe(true);

    const createJobRes = await app.inject({
      method: 'POST',
      url: '/jobs',
      payload: {
        title: 'Smoke Test Job',
        bootstrap_image_id: bootstrap_id,
        entrypoint: 'main.js',
      },
    });

    expect(createJobRes.statusCode).toBe(201);
    const { id: job_id } = createJobRes.json() as { id: string };

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/jobs/${job_id}`,
      payload: {
        description: 'Updated description',
      },
    });

    expect(patchRes.statusCode).toBe(200);

    const cloneRes = await app.inject({
      method: 'POST',
      url: `/jobs/${job_id}/clone`,
    });

    expect(cloneRes.statusCode).toBe(201);
    const { id: cloned_job_id } = cloneRes.json() as { id: string };
    expect(cloned_job_id).not.toBe(job_id);

    const createTokenRes = await app.inject({
      method: 'POST',
      url: `/jobs/${job_id}/share-tokens`,
      payload: {
        expires_in_seconds: 3600,
        max_claims: 1,
      },
    });

    expect(createTokenRes.statusCode).toBe(201);

    const {
      token,
      docker_image,
      docker_command,
    } = createTokenRes.json() as {
      token: string;
      docker_image: string;
      docker_command: string;
    };

    expect(docker_image).toBe('node:20-slim');
    expect(docker_command).toContain('node:20-slim');
    expect(docker_command).toContain(token);

    const claimRes = await app.inject({
      method: 'GET',
      url: '/api/run-config',
      query: { token },
    });

    expect(claimRes.statusCode).toBe(200);
    const { run_id } = claimRes.json() as { run_id: string };

    const startRes = await app.inject({
      method: 'POST',
      url: '/api/runs/start',
      payload: {
        run_id,
        worker_id: 'smoke_worker_1',
        worker_name: 'Smoke Worker',
      },
    });

    expect(startRes.statusCode).toBe(200);

    const logRes = await app.inject({
      method: 'POST',
      url: '/api/runs/logs',
      payload: {
        run_id,
        message: 'Job started',
        level: 'info',
      },
    });

    expect(logRes.statusCode).toBe(200);

    const hbRes = await app.inject({
      method: 'POST',
      url: '/api/runs/heartbeat',
      payload: {
        run_id,
        worker_id: 'smoke_worker_1',
        worker_name: 'Smoke Worker',
      },
    });

    expect(hbRes.statusCode).toBe(200);
    expect(hbRes.json().should_stop).toBe(false);

    const artifactRes = await app.inject({
      method: 'POST',
      url: '/artifacts/upload-run',
      query: { runId: run_id, relativePath: 'output.txt' },
      headers: { 'content-type': 'multipart/form-data; boundary=bound' },
      payload:
        '--bound\r\n' +
        'Content-Disposition: form-data; name="file"; filename="output.txt"\r\n' +
        'Content-Type: text/plain\r\n\r\n' +
        'hello artifact\r\n' +
        '--bound--\r\n',
    });

    expect(artifactRes.statusCode).toBe(200);

    const finishRes = await app.inject({
      method: 'POST',
      url: '/api/runs/finish',
      payload: {
        run_id,
        status: 'finished',
        result: 'Success',
        metrics: { duration_ms: 500 },
      },
    });

    expect(finishRes.statusCode).toBe(200);

    const runDetailsRes = await app.inject({
      method: 'GET',
      url: `/api/runs/${run_id}`,
    });

    expect(runDetailsRes.statusCode).toBe(200);
    const runDetails = runDetailsRes.json() as {
      status: string;
      logs: Array<{ message: string }>;
      artifacts: Array<{ filename: string }>;
    };

    expect(runDetails.status).toBe('finished');
    expect(runDetails.logs.length).toBeGreaterThan(0);
    expect(runDetails.logs[0].message).toBe('Job started');
    expect(runDetails.artifacts.length).toBeGreaterThan(0);
    expect(runDetails.artifacts[0].filename).toBe('output.txt');

    const activeTokenRes = await app.inject({
      method: 'POST',
      url: `/jobs/${job_id}/share-tokens`,
      payload: { max_claims: 1 },
    });

    const activeToken = (activeTokenRes.json() as { token: string }).token;

    await app.inject({
      method: 'GET',
      url: '/api/run-config',
      query: { token: activeToken },
    });

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/jobs/${job_id}`,
    });

    expect(deleteRes.statusCode).toBe(400);
    expect(deleteRes.json().error).toContain('active runs');
  });
});