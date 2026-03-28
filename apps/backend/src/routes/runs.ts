import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { JobService } from '../services/job.service';
import { RunStatus } from '../models/job';

interface ListRunsQuerystring {
  search?: string;
  status?: RunStatus;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export default async function runsRoutes(app: FastifyInstance) {
  app.get(
    '/runs',
    async (req: FastifyRequest<{ Querystring: ListRunsQuerystring }>, reply: FastifyReply) => {
      try {
        const filters = {
          ...req.query,
          limit: req.query.limit ? Number(req.query.limit) : 20,
          offset: req.query.offset ? Number(req.query.offset) : 0,
        };

        const result = await JobService.listGlobalRuns(filters);
        return reply.send(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to list runs';
        req.log.error({ err }, '[GET /api/runs] failed');
        return reply.code(400).send({ error: message });
      }
    },
  );

  app.get(
    '/runs/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const run = await JobService.getRun(req.params.id);
        if (!run) {
          return reply.code(404).send({ error: 'Run not found' });
        }
        return reply.send(run);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get run';
        req.log.error({ err }, '[GET /api/runs/:id] failed');
        return reply.code(400).send({ error: message });
      }
    },
  );

  app.delete(
    '/runs/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await JobService.deleteRun(req.params.id);
        return reply.code(204).send();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete run';
        req.log.error({ err }, '[DELETE /api/runs/:id] failed');
        return reply.code(400).send({ error: message });
      }
    },
  );
}
