import { useEffect, useRef } from 'react';
import { buildRunWebSocketUrl } from '@/api/client';
import type { LogEntry, RunStatus } from '@/api/types';

interface WebsocketPayload {
  type: 'run_log' | 'run_status';
  message?: string;
  level?: LogEntry['level'];
  status?: RunStatus;
}

export function useRunWebsocket({
  runId,
  enabled,
  onLog,
  onStatus,
}: {
  runId: string;
  enabled: boolean;
  onLog: (entry: LogEntry) => void;
  onStatus: (status: RunStatus) => void;
}) {
  const onLogRef = useRef(onLog);
  const onStatusRef = useRef(onStatus);

  useEffect(() => {
    onLogRef.current = onLog;
  }, [onLog]);

  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

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
          });
        }

        if (payload.type === 'run_status' && payload.status) {
          onStatusRef.current(payload.status);
        }
      } catch {
        // ignore malformed payloads
      }
    };

    return () => {
      socket.close();
    };
  }, [enabled, runId]);
}
