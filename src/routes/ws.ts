import { FastifyInstance } from "fastify";
import { WebSocket } from "ws";

type WSConnection = {
  socket: WebSocket;
};

// Map job_id -> подключения
const clients = new Map<string, WSConnection[]>();

export default async function (app: FastifyInstance) {
  // Используем any для TS, чтобы не ругался на websocket route
  app.get("/ws/:job_id", { websocket: true } as any, (connection: any, req: any) => {
    // job_id берём из params
    const jobId = req.params.job_id as string;

    if (!clients.has(jobId)) clients.set(jobId, []);
    clients.get(jobId)!.push(connection);

    // remove connection on close
    connection.socket.on("close", () => {
      const arr = clients.get(jobId) || [];
      clients.set(jobId, arr.filter((c: any) => c !== connection));
    });
  });

  // Добавляем Map в Fastify
  app.decorate("wsClients", clients);
}