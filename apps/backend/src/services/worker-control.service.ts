import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

export type WorkerEnvelope<T = Record<string, unknown>> = {
  type: string;
  request_id?: string;
  payload?: T;
};

export type WorkerSession = {
  socket: WebSocket;
  worker_id: string;
  worker_name: string;
  worker_host?: string | null;
  capabilities?: Record<string, unknown> | null;
  current_run_id?: string | null;
  connected_at: string;
  last_seen_at: string;
};

type PendingRequest = {
  run_id: string;
  type: string;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

const sessionsByWorkerId = new Map<string, WorkerSession>();
const runToWorkerId = new Map<string, string>();
const pendingRequests = new Map<string, PendingRequest>();

const nowIso = () => new Date().toISOString();

const socketIsOpen = (socket: WebSocket) => socket.readyState === WebSocket.OPEN;

const sendEnvelope = (socket: WebSocket, envelope: WorkerEnvelope): boolean => {
  if (!socketIsOpen(socket)) return false;

  socket.send(JSON.stringify(envelope));
  return true;
};

export class WorkerControlService {
  static registerWorker(
    data: {
      worker_id: string;
      worker_name: string;
      worker_host?: string | null;
      capabilities?: Record<string, unknown> | null;
      current_run_id?: string | null;
    },
    socket: WebSocket,
  ): WorkerSession {
    const existing = sessionsByWorkerId.get(data.worker_id);
    if (existing && existing.socket !== socket && socketIsOpen(existing.socket)) {
      try {
        existing.socket.close(4000, 'Superseded by a newer worker session');
      } catch {
        // ignore
      }
    }

    const session: WorkerSession = {
      socket,
      worker_id: data.worker_id,
      worker_name: data.worker_name,
      worker_host: data.worker_host ?? null,
      capabilities: data.capabilities ?? null,
      current_run_id: data.current_run_id ?? existing?.current_run_id ?? null,
      connected_at: existing?.connected_at ?? nowIso(),
      last_seen_at: nowIso(),
    };

    sessionsByWorkerId.set(session.worker_id, session);

    if (session.current_run_id) {
      runToWorkerId.set(session.current_run_id, session.worker_id);
    }

    return session;
  }

  static touchWorker(workerId: string): void {
    const session = sessionsByWorkerId.get(workerId);
    if (!session) return;

    session.last_seen_at = nowIso();
  }

  static bindRun(workerId: string, runId: string): void {
    const session = sessionsByWorkerId.get(workerId);
    if (!session) return;

    session.current_run_id = runId;
    session.last_seen_at = nowIso();
    runToWorkerId.set(runId, workerId);
  }

  static unbindRun(runId: string): void {
    const workerId = runToWorkerId.get(runId);
    if (!workerId) return;

    const session = sessionsByWorkerId.get(workerId);
    if (session?.current_run_id === runId) {
      session.current_run_id = null;
      session.last_seen_at = nowIso();
    }

    runToWorkerId.delete(runId);
  }

  static getSessionByWorkerId(workerId: string): WorkerSession | null {
    return sessionsByWorkerId.get(workerId) || null;
  }

  static getSessionByRunId(runId: string): WorkerSession | null {
    const workerId = runToWorkerId.get(runId);
    if (!workerId) return null;
    return sessionsByWorkerId.get(workerId) || null;
  }

  static getSessionBySocket(socket: WebSocket): WorkerSession | null {
    for (const session of sessionsByWorkerId.values()) {
      if (session.socket === socket) {
        return session;
      }
    }
    return null;
  }

  static unregisterSocket(socket: WebSocket): WorkerSession | null {
    const session = this.getSessionBySocket(socket);
    if (!session) return null;

    sessionsByWorkerId.delete(session.worker_id);

    if (session.current_run_id) {
      runToWorkerId.delete(session.current_run_id);
    }

    for (const [requestId, pending] of pendingRequests.entries()) {
      if (pending.run_id === session.current_run_id) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Worker disconnected before replying'));
        pendingRequests.delete(requestId);
      }
    }

    return session;
  }

  static sendToRun(runId: string, type: string, payload: Record<string, unknown> = {}): boolean {
    const session = this.getSessionByRunId(runId);
    if (!session) return false;

    session.last_seen_at = nowIso();

    return sendEnvelope(session.socket, {
      type,
      payload,
    });
  }

  static sendSignal(runId: string, signalName: string): boolean {
    return this.sendToRun(runId, 'run.signal', {
      signal: signalName,
    });
  }

  static sendStop(runId: string, reason?: string): boolean {
    return this.sendToRun(runId, 'run.stop', {
      reason: reason || 'Run cancelled by user',
    });
  }

  static async requestToRun<T = unknown>(
    runId: string,
    type: string,
    payload: Record<string, unknown> = {},
    timeoutMs = 30_000,
  ): Promise<T> {
    const session = this.getSessionByRunId(runId);
    if (!session) {
      throw new Error('No active worker session for this run');
    }

    if (!socketIsOpen(session.socket)) {
      throw new Error('Worker socket is not open');
    }

    const requestId = uuidv4().replace(/-/g, '');

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error(`Timed out waiting for worker response to ${type}`));
      }, timeoutMs);

      pendingRequests.set(requestId, {
        run_id: runId,
        type,
        resolve,
        reject,
        timer,
      });

      const sent = sendEnvelope(session.socket, {
        type,
        request_id: requestId,
        payload,
      });

      if (!sent) {
        clearTimeout(timer);
        pendingRequests.delete(requestId);
        reject(new Error('Failed to send request to worker'));
      }
    });
  }

  static resolvePendingRequest(requestId: string, payload: unknown): boolean {
    const pending = pendingRequests.get(requestId);
    if (!pending) return false;

    clearTimeout(pending.timer);
    pendingRequests.delete(requestId);
    pending.resolve(payload);
    return true;
  }

  static rejectPendingRequest(requestId: string, message: string): boolean {
    const pending = pendingRequests.get(requestId);
    if (!pending) return false;

    clearTimeout(pending.timer);
    pendingRequests.delete(requestId);
    pending.reject(new Error(message));
    return true;
  }
}

