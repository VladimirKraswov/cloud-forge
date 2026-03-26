import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { LogLevel, RunStatus } from '../models/job';

type WSConnection = {
  socket: WebSocket;
};

const clients = new Map<string, WSConnection[]>();

const sendToRunClients = (runId: string, payload: Record<string, unknown>) => {
  const runClients = clients.get(runId) || [];
  const message = JSON.stringify({
    ...payload,
    runId,
    timestamp: new Date().toISOString(),
  });

  for (const conn of runClients) {
    try {
      conn.socket.send(message);
    } catch {
      // ignore failed socket send
    }
  }
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

export default async function wsRoutes(app: FastifyInstance) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  app.get('/ws/runs/:run_id', { websocket: true } as any, (connection: any, req: any) => {
    const runId = req.params.run_id as string;

    if (!clients.has(runId)) {
      clients.set(runId, []);
    }

    clients.get(runId)!.push(connection);

    connection.socket.on('close', () => {
      const list = clients.get(runId) || [];
      clients.set(
        runId,
        list.filter((item: any) => item !== connection),
      );
    });
  });
}