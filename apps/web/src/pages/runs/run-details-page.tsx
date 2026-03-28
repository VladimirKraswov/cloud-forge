import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Ban, Download, FileText, Terminal, Trash2, Workflow } from 'lucide-react';
import { useI18n } from '@/shared/lib/i18n';
import { toast } from 'sonner';
import { apiBaseUrl, buildArtifactContentUrl } from '@/api/client';
import { runsApi } from '@/api/runs';
import type { LogEntry, RunEvent, RunStatus } from '@/api/types';
import { RunStatusBadge } from '@/entities/runs/ui/run-status-badge';
import { useRunWebsocket } from '@/features/runs/use-run-websocket';
import { EmptyState } from '@/shared/components/app/empty-state';
import { PageHeader } from '@/shared/components/app/page-header';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { formatDateTime, formatFileSize, formatRelative } from '@/shared/utils/format';

function buildArtifactHref(relativeOrAbsolute?: string, storageKey?: string) {
  if (relativeOrAbsolute?.startsWith('http')) return relativeOrAbsolute;
  if (relativeOrAbsolute?.startsWith('/')) return `${apiBaseUrl}${relativeOrAbsolute}`;
  return storageKey ? buildArtifactContentUrl(storageKey) : '#';
}

function getLogEntryKey(entry: LogEntry) {
  return `${entry.timestamp ?? ''}|${entry.level ?? ''}|${entry.message}`;
}

function mergeLogEntries(initial: LogEntry[], live: LogEntry[]) {
  if (!live.length) return initial;

  const seen = new Set(initial.map(getLogEntryKey));
  const merged = [...initial];

  for (const entry of live) {
    const key = getLogEntryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }

  return merged;
}

function getRunEventKey(event: RunEvent) {
  return (
    event.id ||
    `${event.type}|${event.created_at}|${event.stage ?? ''}|${event.progress ?? ''}|${
      event.message ?? ''
    }`
  );
}

function mergeRunEvents(initial: RunEvent[], live: RunEvent[]) {
  if (!live.length) return initial;

  const seen = new Set(initial.map(getRunEventKey));
  const merged = [...initial];

  for (const event of live) {
    const key = getRunEventKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(event);
  }

  return merged;
}

function EventBadge({ event }: { event: RunEvent }) {
  const className =
    event.type === 'progress'
      ? 'bg-blue-50 text-blue-700'
      : event.type === 'log'
        ? 'bg-slate-100 text-slate-700'
        : 'bg-emerald-50 text-emerald-700';

  return (
    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${className}`}>
      {event.type}
    </span>
  );
}

export function RunDetailsPage() {
  const { runId } = useParams({ from: '/runs/$runId' });
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
  const [liveEvents, setLiveEvents] = useState<RunEvent[]>([]);
  const [liveProgress, setLiveProgress] = useState<{
    stage?: string | null;
    progress?: number | null;
    message?: string | null;
  }>({});

  const runQuery = useQuery({
    queryKey: ['run', runId],
    queryFn: () => runsApi.get(runId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'created' || status === 'running' ? 3_000 : false;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => runsApi.cancel(runId),
    onSuccess: () => {
      toast.success('Run cancellation requested');
      queryClient.invalidateQueries({ queryKey: ['run', runId] });
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => runsApi.delete(runId),
    onSuccess: () => {
      toast.success(t.common.deleted);
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      window.history.back();
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const run = runQuery.data;

  const handleLog = useCallback((entry: LogEntry) => {
    setLiveLogs((current) => {
      const key = getLogEntryKey(entry);
      return current.some((item) => getLogEntryKey(item) === key) ? current : [...current, entry];
    });
  }, []);

  const handleStatus = useCallback(
    (_status: RunStatus) => {
      queryClient.invalidateQueries({ queryKey: ['run', runId] });
    },
    [queryClient, runId],
  );

  const handleProgress = useCallback(
    (payload: {
      stage?: string | null;
      progress?: number | null;
      message?: string | null;
      extra?: Record<string, unknown> | null;
      timestamp?: string;
    }) => {
      setLiveProgress({
        stage: payload.stage ?? null,
        progress: payload.progress ?? null,
        message: payload.message ?? null,
      });

      setLiveEvents((current) => {
        const nextEvent: RunEvent = {
          id: `live_${payload.timestamp ?? Date.now()}_${current.length}`,
          run_id: runId,
          type: 'progress',
          stage: payload.stage ?? null,
          progress: payload.progress ?? null,
          message: payload.message ?? null,
          payload: payload.extra ?? null,
          created_at: payload.timestamp || new Date().toISOString(),
        };

        const key = getRunEventKey(nextEvent);
        return current.some((event) => getRunEventKey(event) === key)
          ? current
          : [...current, nextEvent];
      });
    },
    [runId],
  );

  useRunWebsocket({
    runId,
    enabled: run?.status === 'created' || run?.status === 'running',
    onLog: handleLog,
    onStatus: handleStatus,
    onProgress: handleProgress,
  });

  useEffect(() => {
    setLiveLogs([]);
    setLiveEvents([]);
    setLiveProgress({});
  }, [runId]);

  const mergedLogs = useMemo(() => {
    return mergeLogEntries(run?.logs || [], liveLogs);
  }, [liveLogs, run?.logs]);

  const mergedEvents = useMemo(() => {
    return mergeRunEvents(run?.events || [], liveEvents);
  }, [liveEvents, run?.events]);

  const currentStage = liveProgress.stage ?? run?.stage ?? 'idle';
  const currentProgress =
    typeof liveProgress.progress === 'number'
      ? liveProgress.progress
      : typeof run?.progress === 'number'
        ? run.progress
        : null;
  const currentMessage = liveProgress.message ?? run?.status_message ?? null;

  if (runQuery.isLoading) {
    return (
      <EmptyState
        icon={FileText}
        title="Loading run"
        description="Fetching run details, logs, events and artifacts from the backend."
      />
    );
  }

  if (!run) {
    return (
      <EmptyState
        icon={FileText}
        title="Run not found"
        description="The requested run does not exist or could not be loaded."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Run details"
        title={run.id}
        description={`Job ${run.job_id} · ${run.worker_name || run.worker_id || 'unassigned worker'}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/jobs/$jobId/runs" params={{ jobId: run.job_id }}>
                <ArrowLeft className="h-4 w-4" />
                Job runs
              </Link>
            </Button>

            {run.status === 'created' || run.status === 'running' ? (
              <Button
                variant="destructive"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
              >
                <Ban className="h-4 w-4" />
                {cancelMutation.isPending ? 'Cancelling…' : 'Cancel run'}
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleteMutation.isPending ? 'Deleting…' : t.common.delete}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t.runs.deleteDialog.title}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t.runs.deleteDialog.description}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => deleteMutation.mutate()}
                    >
                      {t.common.delete}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Execution summary</CardTitle>
              <CardDescription>
                Realtime status, stage, worker and lifecycle timestamps.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center gap-3">
                <RunStatusBadge status={run.status} />
                <span className="text-muted-foreground">
                  Last update {formatRelative(run.updated_at)}
                </span>
              </div>

              <div className="rounded-2xl border border-border bg-muted/50 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Stage
                    </div>
                    <div className="mt-1 font-medium">{currentStage || 'idle'}</div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Progress
                    </div>
                    <div className="mt-1 font-medium">
                      {typeof currentProgress === 'number' ? `${currentProgress}%` : '—'}
                    </div>
                  </div>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-background">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${typeof currentProgress === 'number' ? currentProgress : 0}%`,
                    }}
                  />
                </div>

                {currentMessage ? (
                  <div className="mt-3 text-xs text-muted-foreground">{currentMessage}</div>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Created
                  </div>
                  <div className="mt-1">{formatDateTime(run.created_at)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Started
                  </div>
                  <div className="mt-1">
                    {run.started_at ? formatDateTime(run.started_at) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Finished
                  </div>
                  <div className="mt-1">
                    {run.finished_at ? formatDateTime(run.finished_at) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Worker
                  </div>
                  <div className="mt-1">{run.worker_name || run.worker_id || '—'}</div>
                </div>
              </div>

              {run.cancel_requested_at ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Cancel requested {formatRelative(run.cancel_requested_at)}
                  {run.cancel_reason ? ` · ${run.cancel_reason}` : ''}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Artifacts</CardTitle>
              <CardDescription>
                Files produced by the run and registered in the backend.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3">
              {run.artifacts?.length ? (
                run.artifacts.map((artifact) => (
                  <div
                    key={artifact.id}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-border px-4 py-3"
                  >
                    <div>
                      <p className="font-medium">{artifact.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {artifact.relative_path} · {formatFileSize(artifact.size_bytes)}
                      </p>
                    </div>

                    <Button variant="outline" asChild>
                      <a
                        href={buildArtifactHref(
                          artifact.content_path || artifact.download_path,
                          artifact.storage_key,
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  No artifacts registered for this run.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Logs, events & manifest</CardTitle>
            <CardDescription>
              Live logs stream via WebSocket, structured run events and the immutable run
              manifest.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Tabs defaultValue="logs">
              <TabsList>
                <TabsTrigger value="logs">Logs</TabsTrigger>
                <TabsTrigger value="events">Events</TabsTrigger>
                <TabsTrigger value="manifest">Manifest</TabsTrigger>
                <TabsTrigger value="metrics">Metrics</TabsTrigger>
              </TabsList>

              <TabsContent value="logs">
                <div className="mt-4 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950">
                  <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Terminal className="h-4 w-4" />
                      <span className="text-sm font-medium">Live logs</span>
                    </div>
                    <span className="text-xs uppercase tracking-[0.24em] text-slate-500">
                      {run.status === 'running' || run.status === 'created'
                        ? 'streaming'
                        : 'static'}
                    </span>
                  </div>

                  <div className="custom-scrollbar h-[520px] overflow-y-auto p-4 font-mono text-sm text-slate-200">
                    {mergedLogs.length ? (
                      mergedLogs.map((entry, index) => (
                        <div
                          key={`${getLogEntryKey(entry)}_${index}`}
                          className="mb-2 grid grid-cols-[56px_1fr] gap-4"
                        >
                          <span className="text-right text-xs text-slate-500">
                            {index + 1}
                          </span>
                          <span className="whitespace-pre-wrap break-words">
                            {entry.message}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-slate-500">
                        No logs available yet.
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="events">
                <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto">
                  {mergedEvents.length ? (
                    mergedEvents.map((event, index) => (
                      <div
                        key={`${getRunEventKey(event)}_${index}`}
                        className="rounded-2xl border border-border bg-card px-4 py-3"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Workflow className="h-4 w-4 text-primary" />
                            <span className="font-medium">
                              {event.message || 'Run event'}
                            </span>
                          </div>
                          <EventBadge event={event} />
                        </div>

                        <div className="text-xs text-muted-foreground">
                          {event.stage || 'no-stage'}
                          {typeof event.progress === 'number' ? ` · ${event.progress}%` : ''}
                          {' · '}
                          {formatRelative(event.created_at)}
                        </div>

                        {event.payload ? (
                          <pre className="custom-scrollbar mt-3 overflow-x-auto rounded-2xl bg-muted p-3 text-xs">
                            {JSON.stringify(event.payload, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                      No structured events recorded for this run yet.
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="manifest">
                <div className="mt-4 rounded-3xl border border-border bg-muted/50 p-4">
                  <pre className="custom-scrollbar overflow-x-auto whitespace-pre-wrap break-words text-sm">
                    {JSON.stringify(run.run_manifest, null, 2)}
                  </pre>
                </div>
              </TabsContent>

              <TabsContent value="metrics">
                <div className="mt-4 rounded-3xl border border-border bg-muted/50 p-4">
                  <pre className="custom-scrollbar overflow-x-auto whitespace-pre-wrap break-words text-sm">
                    {JSON.stringify(run.metrics || {}, null, 2)}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}