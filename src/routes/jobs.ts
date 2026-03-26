import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { JobService } from '../services/job.service';

export default async function (app: FastifyInstance) {
  app.post(
    '/jobs',
    {
      schema: {
        description: 'Create a new job',
        body: {
          type: 'object',
          properties: {
            command: { type: 'string', default: 'echo hello' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              job_id: { type: 'string' },
              run_token: { type: 'string' },
            },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Body: { command?: string } }>, reply: FastifyReply) => {
      const { id, token } = await JobService.createJob(req.body.command);
      return reply.code(201).send({ job_id: id, run_token: token });
    },
  );

  app.get(
    '/jobs/:id',
    {
      schema: {
        description: 'Get job status and logs',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              job: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  status: { type: 'string' },
                  command: { type: 'string' },
                  result: { type: 'string', nullable: true },
                  metrics: { type: 'string', nullable: true },
                  created_at: { type: 'string' },
                  updated_at: { type: 'string' },
                },
              },
              logs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    job_id: { type: 'string' },
                    message: { type: 'string' },
                    timestamp: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const result = await JobService.getJob(req.params.id);
      if (!result) {
        return reply.code(404).send({ error: 'Job not found' });
      }
      return result;
    },
  );
}
