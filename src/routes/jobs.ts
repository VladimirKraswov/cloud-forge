import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { JobService } from '../services/job.service';
import { Container, RunStatus } from '../models/job';
import { config } from '../utils/config';
import {
  JobValidationError,
  assertValidCreateJobPayload,
  validateCreateJobPayload,
} from '../utils/job-validation';

interface CreateJobBody {
  title: string;
  description?: string | null;
  owner_id?: string | null;
  containers: Container[];
  environments?: Record<string, string>;
  attached_files?: Array<{
    id: string;
    filename: string;
    size_bytes: number;
    storage_key: string;
    mime_type: string;
  }>;
  execution_code: string;
  execution_language?: 'python' | 'javascript';
  entrypoint?: string | null;
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
  app.post(
    '/jobs/validate',
    {
      schema: {
        description: 'Validate job payload before creation',
        body: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
    async (req: FastifyRequest<{ Body: CreateJobBody }>, reply: FastifyReply) => {
      const result = validateCreateJobPayload(req.body);

      if (!result.valid) {
        return reply.code(422).send(result);
      }

      return reply.code(200).send(result);
    },
  );

  app.post(
    '/jobs',
    {
      schema: {
        description: 'Create a new job template',
        body: {
          type: 'object',
          required: ['title', 'containers', 'execution_code'],
          properties: {
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            owner_id: { type: 'string', nullable: true },
            containers: {
              type: 'array',
              items: { type: 'object' },
            },
            environments: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
            attached_files: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'filename', 'size_bytes', 'storage_key', 'mime_type'],
                properties: {
                  id: { type: 'string' },
                  filename: { type: 'string' },
                  size_bytes: { type: 'integer' },
                  storage_key: { type: 'string' },
                  mime_type: { type: 'string' },
                },
              },
            },
            execution_code: { type: 'string' },
            execution_language: {
              type: 'string',
              enum: ['python', 'javascript'],
            },
            entrypoint: { type: 'string', nullable: true },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Body: CreateJobBody }>, reply: FastifyReply) => {
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
    },
  );

  app.get(
    '/jobs',
    {
      schema: {
        description: 'List jobs',
        querystring: {
          type: 'object',
          properties: {
            search: { type: 'string' },
            status: {
              type: 'string',
              enum: ['created', 'running', 'finished', 'failed', 'cancelled', 'lost'],
            },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            offset: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Querystring: ListJobsQuerystring }>) => {
      const limit = req.query.limit ?? 20;
      const offset = req.query.offset ?? 0;

      return JobService.listJobs({
        ...req.query,
        limit: Number(limit),
        offset: Number(offset),
      });
    },
  );

  app.get(
    '/jobs/:id',
    {
      schema: {
        description: 'Get a single job by id',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const job = await JobService.getJob(req.params.id);

      if (!job) {
        return reply.code(404).send({ error: 'Job not found' });
      }

      return reply.send(job);
    },
  );

  app.patch(
    '/jobs/:id',
    {
      schema: {
        description: 'Update an existing job',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            owner_id: { type: 'string', nullable: true },
            containers: {
              type: 'array',
              items: { type: 'object' },
            },
            environments: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
            attached_files: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'filename', 'size_bytes', 'storage_key', 'mime_type'],
                properties: {
                  id: { type: 'string' },
                  filename: { type: 'string' },
                  size_bytes: { type: 'integer' },
                  storage_key: { type: 'string' },
                  mime_type: { type: 'string' },
                },
              },
            },
            execution_code: { type: 'string' },
            execution_language: {
              type: 'string',
              enum: ['python', 'javascript'],
            },
            entrypoint: { type: 'string', nullable: true },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: UpdateJobBody }>,
      reply: FastifyReply,
    ) => {
      try {
        const result = await JobService.updateJob(req.params.id, req.body);
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
    {
      schema: {
        description: 'Delete a job and its associated runs and tokens',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
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
    {
      schema: {
        description: 'Clone a job',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
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
    {
      schema: {
        description: 'List runs for a specific job',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            offset: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
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
    {
      schema: {
        description: 'Create a share token for remote run',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            expires_in_seconds: { type: 'integer', minimum: 1, nullable: true },
            expires_at: { type: 'string', format: 'date-time', nullable: true },
            max_claims: { type: 'integer', minimum: 1, nullable: true },
          },
        },
      },
    },
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
    {
      schema: {
        description: 'List share tokens for a specific job',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
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
}