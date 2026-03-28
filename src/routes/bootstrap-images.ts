import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import {
  BootstrapBuilderService,
  BootstrapEnvironmentInput,
} from '../services/bootstrap-builder.service';
import { JobService } from '../services/job.service';

type PreviewBootstrapImageBody = {
  baseImage: string;
  environments: BootstrapEnvironmentInput[];
  dockerfileOverride?: string | null;
};

type BuildBootstrapImageBody = {
  name: string;
  baseImage: string;
  tag: string;
  environments: BootstrapEnvironmentInput[];
  dockerfileText: string;
  runtimeResources?: Record<string, unknown> | null;
  dockerUser: string;
  dockerPass: string;
};

export default async function bootstrapImageRoutes(app: FastifyInstance) {
  app.post(
    '/api/bootstrap-images/preview',
    {
      schema: {
        description:
          'Generate Dockerfile preview for a bootstrap image with isolated Python environments',
        body: {
          type: 'object',
          required: ['baseImage', 'environments'],
          properties: {
            baseImage: { type: 'string', minLength: 1 },
            dockerfileOverride: { type: 'string', nullable: true },
            environments: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['name', 'requirements_text'],
                properties: {
                  name: { type: 'string', minLength: 1 },
                  requirements_text: { type: 'string' },
                  python_binary: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Body: PreviewBootstrapImageBody }>, reply: FastifyReply) => {
      try {
        const dockerfile = BootstrapBuilderService.generateDockerfile(
          req.body.baseImage,
          req.body.environments,
          req.body.dockerfileOverride || undefined,
        );

        return reply.send({ dockerfile });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate Dockerfile';
        req.log.error({ err }, '[POST /api/bootstrap-images/preview] failed');
        return reply.code(400).send({ error: message });
      }
    },
  );

  app.post(
    '/api/bootstrap-images/build',
    {
      schema: {
        description: 'Build and publish a custom bootstrap image',
        body: {
          type: 'object',
          required: [
            'name',
            'baseImage',
            'tag',
            'environments',
            'dockerfileText',
            'dockerUser',
            'dockerPass',
          ],
          properties: {
            name: { type: 'string', minLength: 1 },
            baseImage: { type: 'string', minLength: 1 },
            tag: { type: 'string', minLength: 1 },
            dockerfileText: { type: 'string', minLength: 1 },
            runtimeResources: { type: 'object', additionalProperties: true, nullable: true },
            dockerUser: { type: 'string', minLength: 1 },
            dockerPass: { type: 'string', minLength: 1 },
            environments: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['name', 'requirements_text'],
                properties: {
                  name: { type: 'string', minLength: 1 },
                  requirements_text: { type: 'string' },
                  python_binary: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Body: BuildBootstrapImageBody }>, reply: FastifyReply) => {
      try {
        const id = `img_${uuidv4().replace(/-/g, '')}`;

        void BootstrapBuilderService.buildAndPush({
          id,
          name: req.body.name,
          baseImage: req.body.baseImage,
          tag: req.body.tag,
          dockerfileText: req.body.dockerfileText,
          environments: req.body.environments,
          runtimeResources: req.body.runtimeResources,
          dockerUser: req.body.dockerUser,
          dockerPass: req.body.dockerPass,
        });

        return reply.code(201).send({
          id,
          status: 'building',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start build';
        req.log.error({ err }, '[POST /api/bootstrap-images/build] failed');
        return reply.code(400).send({ error: message });
      }
    },
  );

  app.post(
    '/api/bootstrap-images/build/:id/cancel',
    {
      schema: {
        description: 'Cancel an active bootstrap image build',
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
        await BootstrapBuilderService.cancelBuild(req.params.id);
        return reply.send({ success: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to cancel build';
        req.log.error({ err }, '[POST /api/bootstrap-images/build/:id/cancel] failed');
        return reply.code(400).send({ error: message });
      }
    },
  );

  app.get(
    '/api/bootstrap-images/build/:id',
    {
      schema: {
        description: 'Get in-memory build progress for a bootstrap image build',
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
      const progress = BootstrapBuilderService.getProgress(req.params.id);

      if (!progress) {
        return reply.code(404).send({ error: 'Build session not found' });
      }

      return reply.send(progress);
    },
  );

  app.get(
    '/api/bootstrap-images',
    {
      schema: {
        description: 'List bootstrap images',
        querystring: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['draft', 'building', 'pushing', 'completed', 'failed'],
            },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{
        Querystring: {
          status?: 'draft' | 'building' | 'pushing' | 'completed' | 'failed';
        };
      }>,
    ) => {
      const items = await JobService.listBootstrapImages({
        status: req.query.status,
      });

      return {
        items,
        total: items.length,
      };
    },
  );

  app.get(
    '/api/bootstrap-images/:id',
    {
      schema: {
        description: 'Get a single bootstrap image by id',
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
      const image = await JobService.getBootstrapImage(req.params.id);

      if (!image) {
        return reply.code(404).send({ error: 'Bootstrap image not found' });
      }

      return reply.send(image);
    },
  );

  app.get(
    '/api/bootstrap-images/:id/logs',
    {
      schema: {
        description: 'List persisted logs for a bootstrap image build',
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
        const items = await JobService.listBootstrapImageLogs(req.params.id);
        return reply.send({
          items,
          total: items.length,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load bootstrap image logs';
        req.log.error({ err }, '[GET /api/bootstrap-images/:id/logs] failed');
        return reply.code(404).send({ error: message });
      }
    },
  );
}
