import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { JobService } from '../services/job.service';
import { LogLevel, RunStatus } from '../models/job';
import { broadcastRunLog, broadcastRunStatus } from './ws';

const parseMetrics = (metrics: unknown): unknown => {
  if (typeof metrics !== 'string') return metrics;

  try {
    return JSON.parse(metrics);
  } catch {
    return metrics;
  }
};

type WorkerPayload = {
  worker_id: string;
  worker_name: string;
  worker_host?: string;
  capabilities?: Record<string, unknown>;
};

export default async function workerRoutes(app: FastifyInstance) {
  app.get(
    '/api/run-config',
    {
      schema: {
        description: 'Claim share token and create run config for worker',
        querystring: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{ Querystring: { token: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const result = await JobService.claimRunByToken(req.query.token);
        return reply.send(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to claim run';
        req.log.error({ err }, '[GET /api/run-config] failed');
        return reply.code(403).send({ error: message });
      }
    },
  );

  app.post(
    '/api/runs/start',
    {
      schema: {
        description: 'Mark run as started by worker',
        body: {
          type: 'object',
          required: ['run_id', 'worker_id', 'worker_name'],
          properties: {
            run_id: { type: 'string' },
            worker_id: { type: 'string' },
            worker_name: { type: 'string' },
            worker_host: { type: 'string' },
            capabilities: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{
        Body: { run_id: string } & WorkerPayload;
      }>,
      reply: FastifyReply,
    ) => {
      try {
        await JobService.markRunStarted(req.body.run_id, {
          id: req.body.worker_id,
          name: req.body.worker_name,
          host: req.body.worker_host ?? null,
          capabilities: req.body.capabilities ?? null,
        });

        broadcastRunStatus(req.body.run_id, 'running');
        return reply.send({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start run';
        req.log.error({ err }, '[POST /api/runs/start] failed');
        return reply.code(404).send({ error: message });
      }
    },
  );

  app.post(
    '/api/runs/heartbeat',
    {
      schema: {
        description: 'Heartbeat from worker while run is executing',
        body: {
          type: 'object',
          required: ['run_id', 'worker_id', 'worker_name'],
          properties: {
            run_id: { type: 'string' },
            worker_id: { type: 'string' },
            worker_name: { type: 'string' },
            worker_host: { type: 'string' },
            capabilities: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{
        Body: { run_id: string } & WorkerPayload;
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const result = await JobService.heartbeatRun(req.body.run_id, {
          id: req.body.worker_id,
          name: req.body.worker_name,
          host: req.body.worker_host ?? null,
          capabilities: req.body.capabilities ?? null,
        });

        return reply.send({
          ok: true,
          should_stop: result.should_stop,
          stop_reason: result.stop_reason,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to register heartbeat';
        req.log.error({ err }, '[POST /api/runs/heartbeat] failed');
        return reply.code(404).send({ error: message });
      }
    },
  );

  app.post(
    '/api/runs/logs',
    {
      schema: {
        description: 'Submit run logs',
        body: {
          type: 'object',
          required: ['run_id', 'message'],
          properties: {
            run_id: { type: 'string' },
            message: { type: 'string' },
            level: { type: 'string', enum: ['info', 'warn', 'error'] },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{
        Body: { run_id: string; message: string; level?: LogLevel };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const level = req.body.level || 'info';
        await JobService.addRunLog(req.body.run_id, req.body.message, level);
        broadcastRunLog(req.body.run_id, req.body.message, level);
        return reply.send({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to submit log';
        req.log.error({ err }, '[POST /api/runs/logs] failed');
        return reply.code(404).send({ error: message });
      }
    },
  );

  app.post(
    '/api/runs/:id/cancel',
    {
      schema: {
        description: 'Request run cancellation',
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
            reason: { type: 'string' },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: { reason?: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const result = await JobService.cancelRun(req.params.id, req.body?.reason);

        if (result.final) {
          broadcastRunStatus(req.params.id, 'cancelled');
        }

        return reply.send(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to cancel run';
        req.log.error({ err }, '[POST /api/runs/:id/cancel] failed');
        return reply.code(400).send({ error: message });
      }
    },
  );

  app.post(
    '/api/runs/finish',
    {
      schema: {
        description: 'Finish run',
        body: {
          type: 'object',
          required: ['run_id', 'status'],
          properties: {
            run_id: { type: 'string' },
            status: {
              type: 'string',
              enum: ['finished', 'failed', 'cancelled', 'lost'],
            },
            result: { type: 'string' },
            metrics: {
              anyOf: [
                { type: 'string' },
                { type: 'object', additionalProperties: true },
              ],
            },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{
        Body: {
          run_id: string;
          status: Extract<RunStatus, 'finished' | 'failed' | 'cancelled' | 'lost'>;
          result?: string;
          metrics?: unknown;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        await JobService.finishRun(
          req.body.run_id,
          req.body.status,
          req.body.result,
          parseMetrics(req.body.metrics),
        );

        broadcastRunStatus(req.body.run_id, req.body.status);
        return reply.send({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to finish run';
        req.log.error({ err }, '[POST /api/runs/finish] failed');
        return reply.code(404).send({ error: message });
      }
    },
  );

  app.get(
    '/api/runs/:id',
    {
      schema: {
        description: 'Get run details with logs, worker and artifacts',
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
      const result = await JobService.getRun(req.params.id);

      if (!result) {
        return reply.code(404).send({ error: 'Run not found' });
      }

      return result;
    },
  );
}