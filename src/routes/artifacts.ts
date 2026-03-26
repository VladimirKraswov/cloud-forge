import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ArtifactService } from '../services/artifact.service';
import { JobService } from '../services/job.service';

interface UploadJobArtifactQuerystring {
  jobId: string;
}

interface UploadRunArtifactQuerystring {
  runId: string;
  relativePath?: string;
}

interface DownloadArtifactQuerystring {
  key: string;
}

export default async function artifactsRoutes(app: FastifyInstance) {
  app.post(
    '/artifacts/upload-job',
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
      req: FastifyRequest<{ Querystring: UploadJobArtifactQuerystring }>,
      reply: FastifyReply,
    ) => {
      const file = await req.file();

      if (!file) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      const buffer = await file.toBuffer();

      const uploaded = await ArtifactService.uploadJobFile(
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

  app.post(
    '/artifacts/upload-run',
    {
      schema: {
        description: 'Upload artifact produced by a run',
        consumes: ['multipart/form-data'],
        querystring: {
          type: 'object',
          required: ['runId'],
          properties: {
            runId: { type: 'string' },
            relativePath: { type: 'string' },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{ Querystring: UploadRunArtifactQuerystring }>,
      reply: FastifyReply,
    ) => {
      const file = await req.file();

      if (!file) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      const buffer = await file.toBuffer();
      const relativePath = req.query.relativePath || file.filename;

      const uploaded = await ArtifactService.uploadRunArtifact(
        buffer,
        file.filename,
        req.query.runId,
        relativePath,
        file.mimetype,
      );

      const artifact = await JobService.registerRunArtifact({
        run_id: req.query.runId,
        filename: uploaded.filename,
        relative_path: uploaded.relative_path,
        size_bytes: uploaded.size_bytes,
        storage_key: uploaded.storage_key,
        mime_type: file.mimetype,
      });

      return reply.send({
        ...artifact,
        download_path: `/artifacts/download?key=${encodeURIComponent(artifact.storage_key)}`,
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