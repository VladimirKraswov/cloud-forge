import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';

type WSConnection = {
  socket: WebSocket;
};

const clients = new Map<string, WSConnection[]>();

export const broadcastJobStatus = (jobId: string, status: string) => {
  const jobClients = clients.get(jobId) || [];
  const message = JSON.stringify({
    type: 'status',
    jobId,
    status,
    timestamp: new Date().toISOString(),
  });
  for (const conn of jobClients) {
    try {
      conn.socket.send(message);
    } catch {
      // ignore
    }
  }
};

export const broadcastLog = (jobId: string, logMessage: string) => {
  const jobClients = clients.get(jobId) || [];
  const message = JSON.stringify({
    type: 'log',
    jobId,
    message: logMessage,
    timestamp: new Date().toISOString(),
  });
  for (const conn of jobClients) {
    try {
      conn.socket.send(message);
    } catch {
      // ignore
    }
  }
};

export default async function (app: FastifyInstance) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  app.get('/ws/:job_id', { websocket: true } as any, (connection: any, req: any) => {
    const jobId = req.params.job_id as string;

    if (!clients.has(jobId)) {
      clients.set(jobId, []);
    }
    clients.get(jobId)!.push(connection);

    connection.socket.on('close', () => {
      const arr = clients.get(jobId) || [];
      clients.set(
        jobId,
        arr.filter((c: any) => c !== connection),
      );
    });
  });

  app.decorate('wsClients', clients);
}
