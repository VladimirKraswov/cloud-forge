import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ArtifactService } from '../services/artifact.service';
import { JobService } from '../services/job.service';

interface UploadRunArtifactQuerystring {
  runId: string;
  relativePath?: string;
}

interface DownloadArtifactQuerystring {
  key: string;
}

export default async function artifactsRoutes(app: FastifyInstance) {
  app.post(
    '/artifacts/upload-run',
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
        content_path: `/artifacts/content?key=${encodeURIComponent(artifact.storage_key)}`,
      });
    },
  );

  app.get(
    '/artifacts/download',
    async (
      req: FastifyRequest<{ Querystring: DownloadArtifactQuerystring }>,
      reply: FastifyReply,
    ) => {
      const url = await ArtifactService.getDownloadUrl(req.query.key);
      return reply.redirect(url);
    },
  );

  app.get(
    '/artifacts/content',
    async (
      req: FastifyRequest<{ Querystring: DownloadArtifactQuerystring }>,
      reply: FastifyReply,
    ) => {
      const objectResponse = await ArtifactService.getObject(req.query.key);

      if (objectResponse.ContentType) {
        reply.type(objectResponse.ContentType);
      }

      if (objectResponse.ContentLength != null) {
        reply.header('content-length', String(objectResponse.ContentLength));
      }

      return reply.send(objectResponse.Body as any);
    },
  );
}
