import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import db from '../db/index';
import { ArtifactService } from '../services/artifact.service';

export default async function healthRoutes(app: FastifyInstance) {
  app.get('/health/live', async () => {
    return { status: 'ok' };
  });

  app.get('/health/ready', async (req: FastifyRequest, reply: FastifyReply) => {
    const checks: Record<string, string> = {
      db: 'pending',
      artifacts: 'pending',
    };

    let isReady = true;

    // Check DB
    try {
      await new Promise<void>((resolve, reject) => {
        db.get('SELECT 1', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      checks.db = 'ok';
    } catch (err) {
      req.log.error({ err }, 'Readiness check: DB failed');
      checks.db = 'error';
      isReady = false;
    }

    // Check Artifacts (MinIO)
    try {
      await ArtifactService.ensureBucket();
      checks.artifacts = 'ok';
    } catch (err) {
      req.log.error({ err }, 'Readiness check: Artifacts failed');
      checks.artifacts = 'error';
      isReady = false;
    }

    if (!isReady) {
      return reply.code(503).send({
        status: 'error',
        checks,
      });
    }

    return {
      status: 'ok',
      checks,
    };
  });
}
