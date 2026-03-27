import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { containerPresets, jobTemplates } from '../catalog/presets';
import db from '../db';
import { ContainerPreset } from '../models/job';

export default async function catalogRoutes(app: FastifyInstance) {
  app.get(
    '/catalog/container-presets',
    {
      schema: {
        description: 'Get available container presets for job builder',
      },
    },
    async () => {
      // Fetch custom bootstrap images from database
      const customImages: any[] = await new Promise((resolve, reject) => {
        db.all(
          `SELECT * FROM custom_bootstrap_images WHERE status = 'completed'`,
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          },
        );
      });

      // Map to ContainerPreset format
      const customPresets: ContainerPreset[] = customImages.map((img) => ({
        id: img.id,
        name: `${img.name} (Custom)`,
        category: 'bootstrap',
        description: `Custom bootstrap image based on ${img.base_image}`,
        recommended_for: ['custom', 'ml'],
        support_level: 'supported',
        container: {
          name: 'bootstrap',
          image: img.full_image_name,
          is_parent: true,
          resources: {
            shm_size: '2g',
            cpu_limit: 2,
            memory_limit: '4g',
          },
        },
      }));

      const allPresets = [...containerPresets, ...customPresets];

      return {
        items: allPresets,
        total: allPresets.length,
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