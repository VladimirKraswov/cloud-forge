import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { BootstrapBuilderService } from '../services/bootstrap-builder.service';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';

export default async function bootstrapImageRoutes(app: FastifyInstance) {
  // Build endpoint
  app.post(
    '/api/bootstrap-images/build',
    {
      schema: {
        description: 'Build and publish a custom bootstrap image',
        body: {
          type: 'object',
          required: ['name', 'baseImage', 'tag', 'dockerUser', 'dockerPass'],
          properties: {
            name: { type: 'string' },
            baseImage: { type: 'string' },
            tag: { type: 'string' },
            extraPackages: { type: 'string' },
            dockerUser: { type: 'string' },
            dockerPass: { type: 'string' },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Body: {
      name: string;
      baseImage: string;
      tag: string;
      extraPackages?: string;
      dockerUser: string;
      dockerPass: string;
    } }>, reply: FastifyReply) => {
      const id = `build_${uuidv4().replace(/-/g, '')}`;
      const { name, baseImage, tag, extraPackages, dockerUser, dockerPass } = req.body;

      // Start asynchronous build
      BootstrapBuilderService.buildAndPush({
        id,
        name,
        baseImage,
        tag,
        extraPackages: extraPackages || '',
        dockerUser,
        dockerPass,
      });

      return reply.code(201).send({ id, status: 'building' });
    },
  );

  // Status/Logs endpoint
  app.get(
    '/api/bootstrap-images/build/:id',
    {
      schema: {
        description: 'Get build status and logs',
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

  // List custom images
  app.get(
    '/api/bootstrap-images',
    {
      schema: {
        description: 'List all custom bootstrap images',
      },
    },
    async () => {
      return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM custom_bootstrap_images ORDER BY created_at DESC`, (err, rows) => {
          if (err) reject(err);
          else resolve({ items: rows });
        });
      });
    },
  );

  // Preview Dockerfile endpoint
  app.post(
    '/api/bootstrap-images/preview',
    {
      schema: {
        description: 'Preview the Dockerfile based on build options',
        body: {
          type: 'object',
          required: ['baseImage'],
          properties: {
            baseImage: { type: 'string' },
            extraPackages: { type: 'string' },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Body: {
      baseImage: string;
      extraPackages?: string;
    } }>) => {
      const { baseImage, extraPackages } = req.body;
      const dockerfile = BootstrapBuilderService.generateDockerfile(baseImage, extraPackages || '');
      return { dockerfile };
    },
  );
}
