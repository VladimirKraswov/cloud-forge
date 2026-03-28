import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ArtifactService } from '../services/artifact.service';
import { JobService } from '../services/job.service';
import { LogLevel, RunStatus } from '../models/job';
import { broadcastRunLog, broadcastRunProgress, broadcastRunStatus } from './ws';
import { config } from '../utils/config';

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
    async (req: FastifyRequest<{ Querystring: { token: string } }>, reply: FastifyReply) => {
      try {
        const baseUrl = config.publicBaseUrl || `${req.protocol}://${req.headers.host}`;
        const result = await JobService.claimRunByToken(req.query.token, baseUrl);
        return reply.send(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to claim run';
        req.log.error({ err }, '[GET /api/run-config] failed');
        return reply.code(403).send({ error: message });
      }
    },
  );

  app.get(
    '/api/runs/:id/job-files/content',
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Querystring: { relativePath: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const file = await JobService.getRunJobFile(req.params.id, req.query.relativePath);

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
        const message = err instanceof Error ? err.message : 'Failed to read run job file';
        req.log.error({ err }, '[GET /api/runs/:id/job-files/content] failed');
        return reply.code(404).send({ error: message });
      }
    },
  );

  app.post(
    '/api/runs/start',
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
    '/api/runs/progress',
    async (
      req: FastifyRequest<{
        Body: {
          run_id: string;
          stage?: string;
          progress?: number;
          message?: string;
          extra?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        await JobService.addRunProgress({
          run_id: req.body.run_id,
          stage: req.body.stage ?? null,
          progress: req.body.progress ?? null,
          message: req.body.message ?? null,
          extra: req.body.extra ?? null,
        });

        broadcastRunProgress(req.body.run_id, {
          stage: req.body.stage ?? null,
          progress: req.body.progress ?? null,
          message: req.body.message ?? null,
          extra: req.body.extra ?? null,
        });

        return reply.send({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to submit progress';
        req.log.error({ err }, '[POST /api/runs/progress] failed');
        return reply.code(404).send({ error: message });
      }
    },
  );

  app.post(
    '/api/runs/:id/cancel',
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
    '/api/runs/:id/events',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const events = await JobService.listRunEvents(req.params.id);
        return reply.send({
          items: events,
          total: events.length,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to list run events';
        req.log.error({ err }, '[GET /api/runs/:id/events] failed');
        return reply.code(404).send({ error: message });
      }
    },
  );

  app.get(
    '/api/runs/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const result = await JobService.getRun(req.params.id);

      if (!result) {
        return reply.code(404).send({ error: 'Run not found' });
      }

      return result;
    },
  );
}
