import { useEffect, useRef } from 'react';
import { buildRunWebSocketUrl } from '@/api/client';
import type { LogEntry, RunStatus } from '@/api/types';

type ProgressPayload = {
  stage?: string | null;
  progress?: number | null;
  message?: string | null;
  extra?: Record<string, unknown> | null;
};

type WebsocketPayload =
  | {
      type: 'run_log';
      message?: string;
      level?: LogEntry['level'];
      timestamp?: string;
    }
  | {
      type: 'run_status';
      status?: RunStatus;
      timestamp?: string;
    }
  | ({
      type: 'run_progress';
      timestamp?: string;
    } & ProgressPayload);

export function useRunWebsocket({
  runId,
  enabled,
  onLog,
  onStatus,
  onProgress,
}: {
  runId: string;
  enabled: boolean;
  onLog: (entry: LogEntry) => void;
  onStatus: (status: RunStatus) => void;
  onProgress: (payload: ProgressPayload & { timestamp?: string }) => void;
}) {
  const onLogRef = useRef(onLog);
  const onStatusRef = useRef(onStatus);
  const onProgressRef = useRef(onProgress);

  useEffect(() => {
    onLogRef.current = onLog;
  }, [onLog]);

  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    if (!enabled) return;

    const socket = new WebSocket(buildRunWebSocketUrl(runId));

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as WebsocketPayload;

        if (payload.type === 'run_log' && payload.message) {
          onLogRef.current({
            run_id: runId,
            level: payload.level || 'info',
            message: payload.message,
            timestamp: payload.timestamp,
          });
          return;
        }

        if (payload.type === 'run_status' && payload.status) {
          onStatusRef.current(payload.status);
          return;
        }

        if (payload.type === 'run_progress') {
          onProgressRef.current({
            stage: payload.stage ?? null,
            progress: payload.progress ?? null,
            message: payload.message ?? null,
            extra: payload.extra ?? null,
            timestamp: payload.timestamp,
          });
        }
      } catch {
        // ignore malformed payloads
      }
    };

    socket.onerror = (error) => {
      console.error('Run WebSocket error', error);
    };

    return () => {
      socket.close();
    };
  }, [enabled, runId]);
}