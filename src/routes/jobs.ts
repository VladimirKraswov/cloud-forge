import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { JobService } from '../services/job.service';
import { RunStatus } from '../models/job';
import { config } from '../utils/config';
import {
  JobValidationError,
  assertValidCreateJobPayload,
  assertValidRelativePath,
  validateCreateJobPayload,
} from '../utils/job-validation';
import { ArtifactService } from '../services/artifact.service';

interface CreateJobBody {
  title: string;
  description?: string | null;
  owner_id?: string | null;
  bootstrap_image_id: string;
  environment_variables?: Record<string, string>;
  resources?: {
    gpus?: string;
    shm_size?: string;
    cpu_limit?: number;
    memory_limit?: string;
  } | null;
  entrypoint: string;
  entrypoint_args?: string[];
  working_dir?: string | null;
}

type UpdateJobBody = Partial<CreateJobBody>;

interface CreateShareTokenBody {
  expires_in_seconds?: number | null;
  expires_at?: string | null;
  max_claims?: number | null;
}

interface ListJobsQuerystring {
  search?: string;
  status?: RunStatus;
  limit?: number;
  offset?: number;
}

const getBaseUrl = (req: FastifyRequest): string => {
  if (config.publicBaseUrl) return config.publicBaseUrl;
  const host = req.headers.host || `localhost:${config.port}`;
  return `${req.protocol}://${host}`;
};

const sendRouteError = (
  req: FastifyRequest,
  reply: FastifyReply,
  err: unknown,
  route: string,
  fallbackMessage: string,
) => {
  const message = err instanceof Error ? err.message : fallbackMessage;
  const statusCode = /not found/i.test(message) ? 404 : 400;

  req.log.error({ err }, `[${route}] failed`);
  return reply.code(statusCode).send({ error: message });
};

export default async function jobsRoutes(app: FastifyInstance) {
  app.post('/jobs/validate', async (req: FastifyRequest<{ Body: CreateJobBody }>, reply) => {
    const result = validateCreateJobPayload(req.body);

    if (!result.valid) {
      return reply.code(422).send(result);
    }

    return reply.code(200).send(result);
  });

  app.post('/jobs', async (req: FastifyRequest<{ Body: CreateJobBody }>, reply) => {
    try {
      const normalized = assertValidCreateJobPayload(req.body);
      const created = await JobService.createJob(normalized);
      return reply.code(201).send(created);
    } catch (err) {
      if (err instanceof JobValidationError) {
        return reply.code(422).send({
          valid: false,
          errors: err.details,
          warnings: [],
        });
      }

      return sendRouteError(req, reply, err, 'POST /jobs', 'Failed to create job');
    }
  });

  app.get('/jobs', async (req: FastifyRequest<{ Querystring: ListJobsQuerystring }>) => {
    const limit = req.query.limit ?? 20;
    const offset = req.query.offset ?? 0;

    return JobService.listJobs({
      ...req.query,
      limit: Number(limit),
      offset: Number(offset),
    });
  });

  app.get(
    '/jobs/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const job = await JobService.getJobDetails(req.params.id);

      if (!job) {
        return reply.code(404).send({ error: 'Job not found' });
      }

      return reply.send(job);
    },
  );

  app.patch(
    '/jobs/:id',
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: UpdateJobBody }>,
      reply: FastifyReply,
    ) => {
      try {
        const result = await JobService.updateJob(req.params.id, req.body as any);
        return reply.send(result);
      } catch (err) {
        if (err instanceof JobValidationError) {
          return reply.code(422).send({
            valid: false,
            errors: err.details,
            warnings: [],
          });
        }

        return sendRouteError(req, reply, err, 'PATCH /jobs/:id', 'Failed to update job');
      }
    },
  );

  app.delete(
    '/jobs/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await JobService.deleteJob(req.params.id);
        return reply.code(204).send();
      } catch (err) {
        return sendRouteError(req, reply, err, 'DELETE /jobs/:id', 'Failed to delete job');
      }
    },
  );

  app.post(
    '/jobs/:id/clone',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const result = await JobService.cloneJob(req.params.id);
        return reply.code(201).send(result);
      } catch (err) {
        return sendRouteError(req, reply, err, 'POST /jobs/:id/clone', 'Failed to clone job');
      }
    },
  );

  app.get(
    '/jobs/:id/runs',
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Querystring: { limit?: number; offset?: number };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const limit = req.query.limit ?? 20;
        const offset = req.query.offset ?? 0;

        const result = await JobService.listJobRuns(
          req.params.id,
          Number(limit),
          Number(offset),
        );

        return reply.send(result);
      } catch (err) {
        return sendRouteError(req, reply, err, 'GET /jobs/:id/runs', 'Failed to list job runs');
      }
    },
  );

  app.post(
    '/jobs/:id/share-tokens',
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: CreateShareTokenBody;
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const result = await JobService.createShareToken(
          req.params.id,
          {
            expiresInSeconds: req.body?.expires_in_seconds ?? undefined,
            expiresAt: req.body?.expires_at ?? null,
            maxClaims: req.body?.max_claims ?? undefined,
          },
          getBaseUrl(req),
        );

        return reply.code(201).send(result);
      } catch (err) {
        return sendRouteError(
          req,
          reply,
          err,
          'POST /jobs/:id/share-tokens',
          'Failed to create share token',
        );
      }
    },
  );

  app.get(
    '/jobs/:id/share-tokens',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const result = await JobService.listJobShareTokens(req.params.id);
        return reply.send(result);
      } catch (err) {
        return sendRouteError(
          req,
          reply,
          err,
          'GET /jobs/:id/share-tokens',
          'Failed to list share tokens',
        );
      }
    },
  );

  app.get(
    '/jobs/:id/files',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const files = await JobService.listJobFiles(req.params.id);
        return reply.send({
          items: files,
          total: files.length,
        });
      } catch (err) {
        return sendRouteError(req, reply, err, 'GET /jobs/:id/files', 'Failed to list job files');
      }
    },
  );

  app.post(
    '/jobs/:id/files/upload',
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Querystring: { relativePath?: string; isExecutable?: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const file = await req.file();

        if (!file) {
          return reply.code(400).send({ error: 'No file uploaded' });
        }

        const buffer = await file.toBuffer();
        const relativePath = assertValidRelativePath(
          req.query.relativePath || file.filename,
          'relativePath',
        );

        const uploaded = await ArtifactService.uploadJobFile(
          buffer,
          file.filename,
          req.params.id,
          relativePath,
          file.mimetype,
        );

        const registered = await JobService.registerUploadedJobFile({
          job_id: req.params.id,
          relative_path: uploaded.relative_path,
          filename: uploaded.filename,
          storage_key: uploaded.storage_key,
          mime_type: file.mimetype,
          size_bytes: uploaded.size_bytes,
          is_executable: req.query.isExecutable === '1' || req.query.isExecutable === 'true',
        });

        return reply.code(201).send(registered);
      } catch (err) {
        return sendRouteError(
          req,
          reply,
          err,
          'POST /jobs/:id/files/upload',
          'Failed to upload job file',
        );
      }
    },
  );

  app.put(
    '/jobs/:id/files/content',
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: {
          relative_path: string;
          content: string;
          mime_type?: string;
          is_executable?: boolean;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const saved = await JobService.saveInlineJobFile({
          job_id: req.params.id,
          relative_path: req.body.relative_path,
          content: req.body.content ?? '',
          mime_type: req.body.mime_type,
          is_executable: req.body.is_executable,
        });

        return reply.send(saved);
      } catch (err) {
        return sendRouteError(
          req,
          reply,
          err,
          'PUT /jobs/:id/files/content',
          'Failed to save inline job file',
        );
      }
    },
  );

  app.get(
    '/jobs/:id/files/content',
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Querystring: { relativePath: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const file = await JobService.getJobFile(req.params.id, req.query.relativePath);

        if (file.source_type === 'inline') {
          reply.type(file.mime_type || 'text/plain; charset=utf-8');
          return reply.send(file.inline_content || '');
        }

        if (!file.storage_key) {
          return reply.code(404).send({ error: 'File storage key not found' });
        }

        const objectResponse = await ArtifactService.getObject(file.storage_key);

        if (objectResponse.ContentType) {
          reply.type(objectResponse.ContentType);
        } else {
          reply.type(file.mime_type || 'application/octet-stream');
        }

        return reply.send(objectResponse.Body as any);
      } catch (err) {
        return sendRouteError(
          req,
          reply,
          err,
          'GET /jobs/:id/files/content',
          'Failed to read job file',
        );
      }
    },
  );

  app.delete(
    '/jobs/:id/files',
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Querystring: { relativePath: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        await JobService.deleteJobFile(req.params.id, req.query.relativePath);
        return reply.code(204).send();
      } catch (err) {
        return sendRouteError(
          req,
          reply,
          err,
          'DELETE /jobs/:id/files',
          'Failed to delete job file',
        );
      }
    },
  );
}
