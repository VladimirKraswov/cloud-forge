import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { JobService } from '../services/job.service';

export default async function workersRoutes(app: FastifyInstance) {
  app.get(
    '/workers',
    {
      schema: {
        description: 'List known workers',
      },
    },
    async () => {
      return JobService.listWorkers();
    },
  );

  app.get(
    '/workers/:id',
    {
      schema: {
        description: 'Get worker details',
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
      const worker = await JobService.getWorker(req.params.id);

      if (!worker) {
        return reply.code(404).send({ error: 'Worker not found' });
      }

      return worker;
    },
  );
}