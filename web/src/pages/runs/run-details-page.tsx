import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Ban, Download, FileText, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import { buildArtifactDownloadUrl } from '@/api/client';
import { runsApi } from '@/api/runs';
import type { LogEntry } from '@/api/types';
import { RunStatusBadge } from '@/entities/runs/ui/run-status-badge';
import { useRunWebsocket } from '@/features/runs/use-run-websocket';
import { EmptyState } from '@/shared/components/app/empty-state';
import { PageHeader } from '@/shared/components/app/page-header';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { formatDateTime, formatFileSize, formatRelative } from '@/shared/utils/format';

export function RunDetailsPage() {
  const { runId } = useParams({ from: '/runs/$runId' });
  const queryClient = useQueryClient();
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);

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

  const run = runQuery.data;

  const handleLog = useCallback((entry: LogEntry) => {
    setLiveLogs((current) => [...current, entry]);
  }, []);

  const handleStatus = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['run', runId] });
  }, [queryClient, runId]);

  useRunWebsocket({
    runId,
    enabled: run?.status === 'created' || run?.status === 'running',
    onLog: handleLog,
    onStatus: handleStatus,
  });

  useEffect(() => {
    if (!run?.updated_at) return;
    setLiveLogs([]);
  }, [run?.updated_at]);

  const mergedLogs = useMemo(() => {
    const initialLogs = run?.logs || [];
    if (!liveLogs.length) return initialLogs;
    return [...initialLogs, ...liveLogs];
  }, [liveLogs, run?.logs]);

  if (runQuery.isLoading) {
    return (
      <EmptyState
        icon={FileText}
        title="Loading run"
        description="Fetching run details, logs, and artifacts from the backend."
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
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Execution summary</CardTitle>
              <CardDescription>Realtime status, worker, and lifecycle timestamps.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center gap-3">
                <RunStatusBadge status={run.status} />
                <span className="text-muted-foreground">Last update {formatRelative(run.updated_at)}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Created</div>
                  <div className="mt-1">{formatDateTime(run.created_at)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Started</div>
                  <div className="mt-1">{run.started_at ? formatDateTime(run.started_at) : '—'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Finished</div>
                  <div className="mt-1">{run.finished_at ? formatDateTime(run.finished_at) : '—'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Worker</div>
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
              <CardDescription>Files produced by the run and registered in the backend.</CardDescription>
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
                        href={buildArtifactDownloadUrl(artifact.storage_key)}
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
            <CardTitle>Logs & metrics</CardTitle>
            <CardDescription>Live logs stream via WebSocket and static run metrics snapshot.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="logs">
              <TabsList>
                <TabsTrigger value="logs">Logs</TabsTrigger>
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
                      {run.status === 'running' || run.status === 'created' ? 'streaming' : 'static'}
                    </span>
                  </div>
                  <div className="custom-scrollbar h-[520px] overflow-y-auto p-4 font-mono text-sm text-slate-200">
                    {mergedLogs.length ? (
                      mergedLogs.map((entry, index) => (
                        <div key={`${entry.message}-${index}`} className="mb-2 grid grid-cols-[56px_1fr] gap-4">
                          <span className="text-right text-xs text-slate-500">{index + 1}</span>
                          <span className="whitespace-pre-wrap break-words">{entry.message}</span>
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
              <TabsContent value="metrics">
                <div className="rounded-3xl border border-border bg-muted/50 p-4">
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