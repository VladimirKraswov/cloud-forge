import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { catalogApi } from '@/api/catalog';
import { ApiClientError } from '@/api/client';

const STORAGE_KEY = 'cloudforge.activeBootstrapBuild';
const CHANGED_EVENT = 'cloudforge:bootstrap-build-changed';
export const OPEN_BUILD_DIALOG_EVENT = 'cloudforge:open-bootstrap-build-dialog';

export type BootstrapBuildStatus =
  | 'queued'
  | 'building'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | string;

export type ActiveBootstrapBuild = {
  id: string;
  status: BootstrapBuildStatus;
  logs: string[];
  imageRef?: string;
  startedAt: string;
  updatedAt: string;
};

function isTerminal(status?: string | null) {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function readSnapshot(): ActiveBootstrapBuild | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveBootstrapBuild;
  } catch {
    return null;
  }
}

function writeSnapshot(value: ActiveBootstrapBuild | null) {
  if (typeof window === 'undefined') return;

  if (value) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
}

export function requestOpenBootstrapBuildDialog() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_BUILD_DIALOG_EVENT));
}

export function useBootstrapBuildTracker() {
  const [build, setBuild] = useState<ActiveBootstrapBuild | null>(() => readSnapshot());
  const previousStatusRef = useRef<string | null>(readSnapshot()?.status ?? null);

  const syncFromStorage = useCallback(() => {
    setBuild(readSnapshot());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onStorage = () => syncFromStorage();
    const onChanged = () => syncFromStorage();

    window.addEventListener('storage', onStorage);
    window.addEventListener(CHANGED_EVENT, onChanged);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CHANGED_EVENT, onChanged);
    };
  }, [syncFromStorage]);

  useEffect(() => {
    if (!build?.id || isTerminal(build.status)) return;

    let cancelled = false;

    const poll = async () => {
      try {
        let status = build.status;
        let logs = build.logs;

        try {
          const result = await catalogApi.getBuildProgress(build.id);
          status = result.status;
          logs = result.logs ?? logs;
        } catch (error) {
          if (error instanceof ApiClientError && error.status === 404) {
            const dbImage = await catalogApi.getBootstrapImage(build.id);
            const logResult = await catalogApi.getBootstrapImageLogs(build.id);

            status = dbImage.status;
            logs = logResult.items.map((entry) => entry.message);
          } else {
            throw error;
          }
        }

        if (cancelled) return;

        const current = readSnapshot();
        const next: ActiveBootstrapBuild = {
          id: build.id,
          status,
          logs,
          imageRef: current?.imageRef ?? build.imageRef,
          startedAt: current?.startedAt ?? build.startedAt,
          updatedAt: new Date().toISOString(),
        };

        writeSnapshot(next);
      } catch (error) {
        console.error('Failed to poll bootstrap build progress', error);
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [build?.id, build?.imageRef, build?.startedAt, build?.status]);

  useEffect(() => {
    const currentStatus = build?.status ?? null;
    const previousStatus = previousStatusRef.current;

    if (!build || !previousStatus || previousStatus === currentStatus) {
      previousStatusRef.current = currentStatus;
      return;
    }

    if (currentStatus === 'completed') {
      toast.success('Bootstrap image build completed');
    } else if (currentStatus === 'failed') {
      toast.error('Bootstrap image build failed');
    } else if (currentStatus === 'cancelled') {
      toast('Bootstrap image build cancelled');
    }

    previousStatusRef.current = currentStatus;
  }, [build]);

  const startTracking = useCallback(
    (payload: {
      id: string;
      imageRef?: string;
      logs?: string[];
      status?: BootstrapBuildStatus;
    }) => {
      const timestamp = new Date().toISOString();
      const snapshot: ActiveBootstrapBuild = {
        id: payload.id,
        status: payload.status ?? 'building',
        logs: payload.logs ?? ['Starting build...'],
        imageRef: payload.imageRef,
        startedAt: timestamp,
        updatedAt: timestamp,
      };

      previousStatusRef.current = snapshot.status;
      writeSnapshot(snapshot);
    },
    [],
  );

  const clearTracking = useCallback(() => {
    previousStatusRef.current = null;
    writeSnapshot(null);
  }, []);

  return {
    build,
    isActive: Boolean(build && !isTerminal(build.status)),
    isFinished: Boolean(build && isTerminal(build.status)),
    startTracking,
    clearTracking,
    requestOpen: requestOpenBootstrapBuildDialog,
  };
}