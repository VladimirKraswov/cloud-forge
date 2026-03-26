import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { initDb } from './db/index';
import { config } from './utils/config';
import { logger } from './utils/logger';

import wsRoutes from './routes/ws';
import jobsRoutes from './routes/jobs';
import workerRoutes from './routes/worker';

const app = Fastify({
  logger: logger,
});

const start = async () => {
  try {
    await initDb();

    await app.register(fastifyWebsocket);

    await app.register(fastifySwagger, {
      openapi: {
        info: {
          title: 'Cloud Forge API',
          description: 'Distributed Task Orchestration API',
          version: '1.0.0',
        },
      },
    });

    await app.register(fastifySwaggerUi, {
      routePrefix: '/docs',
    });

    await app.register(wsRoutes);
    await app.register(jobsRoutes);
    await app.register(workerRoutes);

    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`Server running on http://localhost:${config.port}`);
    app.log.info(`Swagger docs available at http://localhost:${config.port}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
