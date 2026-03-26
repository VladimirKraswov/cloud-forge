import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyMultipart from '@fastify/multipart';

import { initDb } from './db/index';
import { config } from './utils/config';

import artifactsRoutes from './routes/artifacts';
import wsRoutes from './routes/ws';
import jobsRoutes from './routes/jobs';
import workerRoutes from './routes/worker';
import workersRoutes from './routes/workers';
import { ArtifactService } from './services/artifact.service';

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
    level: 'info',
  },
});

const start = async () => {
  try {
    await initDb();

    try {
      await ArtifactService.ensureBucket();
    } catch (err) {
      app.log.warn(
        { err },
        'Artifacts bucket is not ready yet, it will be retried on first upload/download',
      );
    }

    await app.register(fastifyMultipart, {
      limits: {
        fileSize: 500 * 1024 * 1024,
      },
    });

    await app.register(fastifyWebsocket);

    await app.register(fastifySwagger, {
      openapi: {
        info: {
          title: 'Cloud Forge API',
          description: 'Distributed Task Orchestration API',
          version: '2.1.0',
        },
      },
    });

    await app.register(fastifySwaggerUi, {
      routePrefix: '/docs',
    });

    await app.register(wsRoutes);
    await app.register(jobsRoutes);
    await app.register(workerRoutes);
    await app.register(workersRoutes);
    await app.register(artifactsRoutes);

    await app.listen({ port: config.port, host: '0.0.0.0' });

    console.log(`🚀 Server running on http://localhost:${config.port}`);
    console.log(`📖 Swagger UI: http://localhost:${config.port}/docs`);
    console.log(`📦 MinIO Console: http://localhost:9001`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Failed to start server:', message);
    process.exit(1);
  }
};

start();