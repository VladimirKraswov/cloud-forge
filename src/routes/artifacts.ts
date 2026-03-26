import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ArtifactService } from '../services/artifact.service';

interface UploadArtifactQuerystring {
  jobId: string;
}

interface DownloadArtifactQuerystring {
  key: string;
}

export default async function artifactsRoutes(app: FastifyInstance) {
  app.post(
    '/artifacts/upload',
    {
      schema: {
        description: 'Upload a file and attach it to a job',
        consumes: ['multipart/form-data'],
        querystring: {
          type: 'object',
          required: ['jobId'],
          properties: {
            jobId: { type: 'string' },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{ Querystring: UploadArtifactQuerystring }>,
      reply: FastifyReply,
    ) => {
      const file = await req.file();

      if (!file) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      const buffer = await file.toBuffer();

      const uploaded = await ArtifactService.uploadFile(
        buffer,
        file.filename,
        req.query.jobId,
        file.mimetype,
      );

      return reply.send({
        ...uploaded,
        mime_type: file.mimetype,
      });
    },
  );

  app.get(
    '/artifacts/download',
    {
      schema: {
        description: 'Get temporary signed URL for artifact download',
        querystring: {
          type: 'object',
          required: ['key'],
          properties: {
            key: { type: 'string' },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{ Querystring: DownloadArtifactQuerystring }>,
      reply: FastifyReply,
    ) => {
      const url = await ArtifactService.getDownloadUrl(req.query.key);
      return reply.redirect(url);
    },
  );
}