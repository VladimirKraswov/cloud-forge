import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { JobService } from '../services/job.service';
import { Container, RunStatus } from '../models/job';
import { config } from '../utils/config';
import {
  JobValidationError,
  validateCreateJobPayload,
} from '../utils/job-validation';

interface CreateJobBody {
  title: string;
  description?: string;
  owner_id?: string;
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
  entrypoint?: string;
}

interface ListJobsQuerystring {
  search?: string;
  status?: RunStatus;
}

interface CreateShareTokenBody {
  expires_in_seconds?: number;
  max_claims?: number;
}

const getBaseUrl = (req: FastifyRequest): string => {
  if (config.publicBaseUrl) return config.publicBaseUrl;
  const host = req.headers.host || `localhost:${config.port}`;
  return `${req.protocol}://${host}`;
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

      return reply.send(result);
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
            description: { type: 'string' },
            owner_id: { type: 'string' },
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
              items: { type: 'object' },
            },
            execution_code: { type: 'string' },
            execution_language: {
              type: 'string',
              enum: ['python', 'javascript'],
            },
            entrypoint: { type: 'string' },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Body: CreateJobBody }>, reply: FastifyReply) => {
      try {
        const { id, normalized } = await JobService.createJob(req.body);
        return reply.code(201).send({
          job_id: id,
          normalized,
        });
      } catch (err) {
        if (err instanceof JobValidationError) {
          return reply.code(422).send({
            valid: false,
            errors: err.details,
            warnings: [],
          });
        }

        const message = err instanceof Error ? err.message : 'Failed to create job';
        req.log.error({ err }, '[POST /jobs] failed');
        return reply.code(400).send({ error: message });
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
          },
        },
      },
    },
    async (req: FastifyRequest<{ Querystring: ListJobsQuerystring }>) => {
      return JobService.listJobs(req.query);
    },
  );

  app.get(
    '/jobs/:id',
    {
      schema: {
        description: 'Get job details with runs and share tokens',
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
      const result = await JobService.getJobDetails(req.params.id);

      if (!result) {
        return reply.code(404).send({ error: 'Job not found' });
      }

      return result;
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
            expires_in_seconds: { type: 'integer', minimum: 1 },
            max_claims: { type: 'integer', minimum: 1 },
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
            expiresInSeconds: req.body?.expires_in_seconds,
            maxClaims: req.body?.max_claims,
          },
          getBaseUrl(req),
        );

        return reply.code(201).send(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create share token';
        req.log.error({ err }, '[POST /jobs/:id/share-tokens] failed');
        return reply.code(400).send({ error: message });
      }
    },
  );
}