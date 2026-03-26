import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { JobService } from '../services/job.service';

export default async function tokensRoutes(app: FastifyInstance) {
  app.get(
    '/share-tokens/:id',
    {
      schema: {
        description: 'Get share token details',
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
      const token = await JobService.getShareToken(req.params.id);

      if (!token) {
        return reply.code(404).send({ error: 'Share token not found' });
      }

      return token;
    },
  );

  app.post(
    '/share-tokens/:id/revoke',
    {
      schema: {
        description: 'Revoke a share token',
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
        await JobService.revokeShareToken(req.params.id);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to revoke token';
        req.log.error({ err }, '[POST /share-tokens/:id/revoke] failed');
        return reply.code(400).send({ error: message });
      }
    },
  );
}
