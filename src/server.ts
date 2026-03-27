import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyMultipart from '@fastify/multipart';

import { initDb } from './db/index';
import { config } from './utils/config';

import artifactsRoutes from './routes/artifacts';
import wsRoutes, { broadcastRunStatus } from './routes/ws';
import jobsRoutes from './routes/jobs';
import workerRoutes from './routes/worker';
import workersRoutes from './routes/workers';
import tokensRoutes from './routes/tokens';
import dashboardRoutes from './routes/dashboard';
import catalogRoutes from './routes/catalog';
import healthRoutes from './routes/health';
import { ArtifactService } from './services/artifact.service';
import { RunWatchdogService } from './services/run-watchdog.service';

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

let watchdogTimer: NodeJS.Timeout | null = null;

const startWatchdog = () => {
  if (watchdogTimer) {
    return;
  }

  watchdogTimer = setInterval(async () => {
    try {
      const lostRuns = await RunWatchdogService.sweep();

      for (const runId of lostRuns) {
        app.log.warn({ runId }, 'Run marked as lost by watchdog');
        broadcastRunStatus(runId, 'lost');
      }
    } catch (err) {
      app.log.error({ err }, 'Run watchdog sweep failed');
    }
  }, config.runWatchdogIntervalSeconds * 1000);
};

const stopWatchdog = () => {
  if (!watchdogTimer) {
    return;
  }

  clearInterval(watchdogTimer);
  watchdogTimer = null;
};

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

    await app.register(cors, {
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });

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
          version: '2.3.0',
        },
      },
    });

    await app.register(fastifySwaggerUi, {
      routePrefix: '/docs',
    });

    await app.register(healthRoutes);
    await app.register(wsRoutes);
    await app.register(catalogRoutes);
    await app.register(jobsRoutes);
    await app.register(workerRoutes);
    await app.register(workersRoutes);
    await app.register(tokensRoutes);
    await app.register(dashboardRoutes);
    await app.register(artifactsRoutes);

    startWatchdog();

    app.addHook('onClose', async () => {
      stopWatchdog();
    });

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