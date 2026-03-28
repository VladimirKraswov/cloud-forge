import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { LogLevel, RunStatus } from '../models/job';
import { config } from '../utils/config';
import { JobService } from '../services/job.service';
import { WorkerModel } from '../models';
import { WorkerControlService, WorkerEnvelope } from '../services/worker-control.service';

type WSConnection = {
  socket: WebSocket;
};

const runClients = new Map<string, WSConnection[]>();

const sendToRunClients = (runId: string, payload: Record<string, unknown>) => {
  const clients = runClients.get(runId) || [];
  const message = JSON.stringify({
    ...payload,
    runId,
    timestamp: new Date().toISOString(),
  });

  for (const conn of clients) {
    try {
      conn.socket.send(message);
    } catch {
      // ignore failed socket send
    }
  }
};

const sendEnvelope = (
  socket: WebSocket,
  type: string,
  payload: Record<string, unknown> = {},
  requestId?: string,
) => {
  socket.send(
    JSON.stringify({
      type,
      request_id: requestId,
      payload,
    }),
  );
};

const sendError = (socket: WebSocket, message: string, requestId?: string) => {
  sendEnvelope(socket, 'error', { message }, requestId);
};

const getBaseUrl = (req: any): string => {
  if (config.publicBaseUrl) return config.publicBaseUrl;

  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto =
    typeof forwardedProto === 'string' && forwardedProto.trim()
      ? forwardedProto.trim()
      : 'http';

  return `${proto}://${req.headers.host}`;
};

export const broadcastRunStatus = (runId: string, status: RunStatus) => {
  sendToRunClients(runId, {
    type: 'run_status',
    status,
  });
};

export const broadcastRunLog = (runId: string, message: string, level: LogLevel = 'info') => {
  sendToRunClients(runId, {
    type: 'run_log',
    level,
    message,
  });
};

export const broadcastRunProgress = (
  runId: string,
  data: {
    stage?: string | null;
    progress?: number | null;
    message?: string | null;
    extra?: Record<string, unknown> | null;
  },
) => {
  sendToRunClients(runId, {
    type: 'run_progress',
    stage: data.stage ?? null,
    progress: data.progress ?? null,
    message: data.message ?? null,
    extra: data.extra ?? null,
  });
};

const handleWorkerMessage = async (
  app: FastifyInstance,
  socket: WebSocket,
  req: any,
  envelope: WorkerEnvelope,
): Promise<void> => {
  const type = envelope?.type;
  const payload = envelope?.payload || {};
  const requestId = envelope?.request_id;

  if (!type || typeof type !== 'string') {
    sendError(socket, 'Message type is required', requestId);
    return;
  }

  const session = WorkerControlService.getSessionBySocket(socket);

  app.log.info(
    {
      type,
      requestId,
      hasSession: Boolean(session),
    },
    '[WS worker] incoming message',
  );

  try {
    switch (type) {
      case 'worker.hello': {
        const workerId = String((payload as any).worker_id || '').trim();
        const workerName = String((payload as any).worker_name || '').trim();
        const workerHost =
          (payload as any).worker_host == null ? null : String((payload as any).worker_host);
        const capabilities =
          typeof (payload as any).capabilities === 'object' &&
          (payload as any).capabilities !== null &&
          !Array.isArray((payload as any).capabilities)
            ? ((payload as any).capabilities as Record<string, unknown>)
            : null;

        if (!workerId || !workerName) {
          sendError(socket, 'worker_id and worker_name are required', requestId);
          return;
        }

        const registered = WorkerControlService.registerWorker(
          {
            worker_id: workerId,
            worker_name: workerName,
            worker_host: workerHost,
            capabilities,
          },
          socket,
        );

        sendEnvelope(
          socket,
          'worker.hello.ack',
          {
            worker_id: registered.worker_id,
            server_time: new Date().toISOString(),
          },
          requestId,
        );

        app.log.info(
          {
            workerId: registered.worker_id,
            workerName: registered.worker_name,
            workerHost: registered.worker_host,
          },
          '[WS worker] hello acknowledged',
        );

        void (async () => {
          try {
            await WorkerModel.upsertHeartbeat({
              id: registered.worker_id,
              name: registered.worker_name,
              host: registered.worker_host ?? null,
              current_run_id: registered.current_run_id ?? null,
              capabilities: registered.capabilities ?? null,
              status: registered.current_run_id ? 'busy' : 'online',
            });
          } catch (err) {
            app.log.error(
              { err, workerId: registered.worker_id },
              '[WS worker] failed to persist worker heartbeat after hello',
            );
          }
        })();

        return;
      }

      case 'run.claim': {
        if (!session) {
          sendError(socket, 'worker.hello must be sent before run.claim', requestId);
          return;
        }

        const token = String((payload as any).token || '').trim();
        if (!token) {
          sendError(socket, 'token is required', requestId);
          return;
        }

        const result = await JobService.claimRunByToken(token, getBaseUrl(req));
        WorkerControlService.bindRun(session.worker_id, result.run_id);

        await WorkerModel.upsertHeartbeat({
          id: session.worker_id,
          name: session.worker_name,
          host: session.worker_host ?? null,
          current_run_id: result.run_id,
          capabilities: session.capabilities ?? null,
          status: 'busy',
        });

        sendEnvelope(
          socket,
          'run.assigned',
          {
            run_id: result.run_id,
            job_id: result.job_id,
            config: result.config,
          },
          requestId,
        );

        app.log.info(
          {
            workerId: session.worker_id,
            runId: result.run_id,
            jobId: result.job_id,
          },
          '[WS worker] run assigned',
        );
        return;
      }

      case 'run.started': {
        if (!session) {
          sendError(socket, 'worker.hello must be sent before run.started', requestId);
          return;
        }

        const runId = String((payload as any).run_id || '').trim();
        if (!runId) {
          sendError(socket, 'run_id is required', requestId);
          return;
        }

        WorkerControlService.bindRun(session.worker_id, runId);

        await JobService.markRunStarted(runId, {
          id: session.worker_id,
          name: session.worker_name,
          host: session.worker_host ?? null,
          capabilities: session.capabilities ?? null,
        });

        broadcastRunStatus(runId, 'running');

        sendEnvelope(socket, 'run.started.ack', { ok: true }, requestId);
        return;
      }

      case 'run.heartbeat': {
        if (!session) {
          sendError(socket, 'worker.hello must be sent before run.heartbeat', requestId);
          return;
        }

        const runId = String((payload as any).run_id || '').trim();
        if (!runId) {
          sendError(socket, 'run_id is required', requestId);
          return;
        }

        WorkerControlService.bindRun(session.worker_id, runId);
        WorkerControlService.touchWorker(session.worker_id);

        const result = await JobService.heartbeatRun(runId, {
          id: session.worker_id,
          name: session.worker_name,
          host: session.worker_host ?? null,
          capabilities: session.capabilities ?? null,
        });

        sendEnvelope(
          socket,
          'run.heartbeat.ack',
          {
            ok: true,
            should_stop: result.should_stop,
            stop_reason: result.stop_reason,
          },
          requestId,
        );
        return;
      }

      case 'run.log': {
        const runId = String((payload as any).run_id || '').trim();
        const message = String((payload as any).message || '');
        const level = ((payload as any).level || 'info') as LogLevel;

        if (!runId || !message) {
          sendError(socket, 'run_id and message are required', requestId);
          return;
        }

        await JobService.addRunLog(runId, message, level);
        broadcastRunLog(runId, message, level);

        if (requestId) {
          sendEnvelope(socket, 'run.log.ack', { ok: true }, requestId);
        }
        return;
      }

      case 'run.progress': {
        const runId = String((payload as any).run_id || '').trim();

        if (!runId) {
          sendError(socket, 'run_id is required', requestId);
          return;
        }

        await JobService.addRunProgress({
          run_id: runId,
          stage: (payload as any).stage ?? null,
          progress: (payload as any).progress ?? null,
          message: (payload as any).message ?? null,
          extra: (payload as any).extra ?? null,
        });

        broadcastRunProgress(runId, {
          stage: (payload as any).stage ?? null,
          progress: (payload as any).progress ?? null,
          message: (payload as any).message ?? null,
          extra: (payload as any).extra ?? null,
        });

        if (requestId) {
          sendEnvelope(socket, 'run.progress.ack', { ok: true }, requestId);
        }
        return;
      }

      case 'run.finished': {
        const runId = String((payload as any).run_id || '').trim();
        const status = (payload as any).status as Extract<
          RunStatus,
          'finished' | 'failed' | 'cancelled' | 'lost'
        >;

        if (!runId || !status) {
          sendError(socket, 'run_id and status are required', requestId);
          return;
        }

        await JobService.finishRun(
          runId,
          status,
          (payload as any).result,
          (payload as any).metrics,
        );

        WorkerControlService.unbindRun(runId);
        broadcastRunStatus(runId, status);

        if (session) {
          await WorkerModel.upsertHeartbeat({
            id: session.worker_id,
            name: session.worker_name,
            host: session.worker_host ?? null,
            current_run_id: null,
            capabilities: session.capabilities ?? null,
            status: 'online',
          });
        }

        sendEnvelope(socket, 'run.finished.ack', { ok: true }, requestId);
        return;
      }

      case 'run.exec.result': {
        if (!requestId) {
          sendError(socket, 'request_id is required for run.exec.result');
          return;
        }

        WorkerControlService.resolvePendingRequest(requestId, payload);
        return;
      }

      default:
        sendError(socket, `Unsupported worker message type: ${type}`, requestId);
        return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Worker WS handler failed';

    app.log.error(
      {
        err,
        type,
        requestId,
        sessionWorkerId: session?.worker_id ?? null,
      },
      '[WS worker] handler failed',
    );

    if (requestId) {
      WorkerControlService.rejectPendingRequest(requestId, message);
    }

    sendError(socket, message, requestId);
  }
};

export default async function wsRoutes(app: FastifyInstance) {
  app.get('/ws/runs/:run_id', { websocket: true } as any, (socket: WebSocket, req: any) => {
    const runId = req.params.run_id as string;

    if (!runClients.has(runId)) {
      runClients.set(runId, []);
    }

    const connection: WSConnection = { socket };
    runClients.get(runId)!.push(connection);

    socket.on('close', () => {
      const list = runClients.get(runId) || [];
      runClients.set(
        runId,
        list.filter((item) => item.socket !== socket),
      );
    });
  });

  app.get('/ws/worker', { websocket: true } as any, (socket: WebSocket, req: any) => {
    app.log.info(
      {
        remoteAddress: req.socket?.remoteAddress ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
      '[WS worker] connection opened',
    );

    socket.on('message', (raw: Buffer | string) => {
      void (async () => {
        try {
          const text = typeof raw === 'string' ? raw : raw.toString('utf8');
          app.log.info({ text }, '[WS worker] raw message received');
          const envelope = JSON.parse(text) as WorkerEnvelope;
          await handleWorkerMessage(app, socket, req, envelope);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Invalid worker WS payload';
          app.log.error({ err }, '[WS worker] invalid payload');
          sendError(socket, message);
        }
      })();
    });

    socket.on('close', () => {
      void (async () => {
        app.log.info('[WS worker] connection closed');

        const session = WorkerControlService.unregisterSocket(socket);
        if (!session) return;

        try {
          await WorkerModel.upsertHeartbeat({
            id: session.worker_id,
            name: session.worker_name,
            host: session.worker_host ?? null,
            current_run_id: session.current_run_id ?? null,
            capabilities: session.capabilities ?? null,
            status: 'offline',
          });
        } catch {
          // ignore cleanup errors
        }
      })();
    });

    socket.on('error', (err: Error) => {
      app.log.error({ err }, '[WS worker] socket error');
    });
  });
}