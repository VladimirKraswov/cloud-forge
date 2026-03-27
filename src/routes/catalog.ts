import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { containerPresets, jobTemplates } from '../catalog/presets';
import { ContainerPreset } from '../models/job';
import { JobService } from '../services/job.service';

export default async function catalogRoutes(app: FastifyInstance) {
  app.get('/catalog/container-presets', async () => {
    const customImages = await JobService.listBootstrapImages({ status: 'completed' });

    const customPresets: ContainerPreset[] = customImages.map((img) => ({
      id: img.id,
      name: `${img.name} (Custom)`,
      category: 'bootstrap',
      description: `Custom bootstrap image based on ${img.base_image}`,
      recommended_for: ['custom', 'bootstrap', 'ml'],
      support_level: 'supported',
      container: {
        name: 'bootstrap',
        image: img.full_image_name,
        is_parent: true,
        resources: img.runtime_resources || undefined,
      },
    }));

    const allPresets = [...containerPresets, ...customPresets];

    return {
      items: allPresets,
      total: allPresets.length,
    };
  });

  app.get('/catalog/job-templates', async () => {
    return {
      items: jobTemplates,
      total: jobTemplates.length,
    };
  });

  app.get(
    '/catalog/job-templates/:id',
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
