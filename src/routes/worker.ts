import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { JobService } from '../services/job.service';
import { JobStatus } from '../models/job';
import { broadcastLog, broadcastJobStatus } from './ws';

export default async function (app: FastifyInstance) {
  app.post(
    '/claim',
    {
      schema: {
        description: 'Claim a job with a token',
        body: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              job_id: { type: 'string' },
              command: { type: 'string' },
            },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Body: { token?: string } }>, reply: FastifyReply) => {
      const { token } = req.body;
      if (!token) {
        return reply.code(400).send({ error: 'token required' });
      }

      const result = await JobService.claimJob(token);
      if (!result) {
        return reply.code(401).send({ error: 'invalid token or job not found' });
      }

      broadcastJobStatus(result.job_id, 'running');

      return result;
    },
  );

  app.post(
    '/logs',
    {
      schema: {
        description: 'Submit logs for a job',
        body: {
          type: 'object',
          required: ['job_id', 'message'],
          properties: {
            job_id: { type: 'string' },
            message: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{ Body: { job_id: string; message: string } }>,
      reply: FastifyReply,
    ) => {
      const { job_id, message } = req.body;

      await JobService.addLog(job_id, message);
      broadcastLog(job_id, message);

      return reply.send({ ok: true });
    },
  );

  app.post(
    '/finish',
    {
      schema: {
        description: 'Finish a job',
        body: {
          type: 'object',
          required: ['job_id'],
          properties: {
            job_id: { type: 'string' },
            status: { type: 'string', enum: ['finished', 'failed'] },
            result: { type: 'string' },
            metrics: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{
        Body: { job_id: string; status?: string; result?: string; metrics?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { job_id, status, result, metrics } = req.body;
      const jobStatus = (status as JobStatus) || 'finished';

      await JobService.finishJob(job_id, jobStatus, result, metrics);
      broadcastJobStatus(job_id, jobStatus);

      return reply.send({ ok: true });
    },
  );
}
