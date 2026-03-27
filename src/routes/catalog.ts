import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { containerPresets, jobTemplates } from '../catalog/presets';

export default async function catalogRoutes(app: FastifyInstance) {
  app.get(
    '/catalog/container-presets',
    {
      schema: {
        description: 'Get available container presets for job builder',
      },
    },
    async () => {
      return {
        items: containerPresets,
        total: containerPresets.length,
      };
    },
  );

  app.get(
    '/catalog/job-templates',
    {
      schema: {
        description: 'Get available job templates for job builder',
      },
    },
    async () => {
      return {
        items: jobTemplates,
        total: jobTemplates.length,
      };
    },
  );

  app.get(
    '/catalog/job-templates/:id',
    {
      schema: {
        description: 'Get a single job template by id',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const template = jobTemplates.find((item) => item.id === req.params.id);

      if (!template) {
        return reply.code(404).send({ error: 'Job template not found' });
      }

      return reply.send(template);
    },
  );
}