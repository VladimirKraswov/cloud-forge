import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, FolderOpen, History, KeyRound, Pencil } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { jobsApi } from '@/api/jobs';
import { CodeBlock } from '@/shared/components/app/code-block';
import { EmptyState } from '@/shared/components/app/empty-state';
import { PageHeader } from '@/shared/components/app/page-header';
import { RunStatusBadge } from '@/entities/runs/ui/run-status-badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { formatDateTime, formatFileSize, formatRelative } from '@/shared/utils/format';

export function JobDetailsPage() {
  const { jobId } = useParams({ from: '/jobs/$jobId' });

  const jobQuery = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => jobsApi.get(jobId),
  });

  const runsQuery = useQuery({
    queryKey: ['job', jobId, 'runs'],
    queryFn: () => jobsApi.listRuns(jobId, { limit: 10, offset: 0 }),
  });

  const tokensQuery = useQuery({
    queryKey: ['job', jobId, 'tokens'],
    queryFn: () => jobsApi.listShareTokens(jobId),
  });

  if (jobQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24" />
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <Skeleton className="h-96" />
            <Skeleton className="h-48" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-80" />
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
          </div>
        </div>
      </div>
    );
  }

  const job = jobQuery.data;

  if (!job) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="Job not found"
        description="The requested job does not exist or could not be loaded."
        action={
          <Button asChild>
            <Link to="/jobs">Back to jobs</Link>
          </Button>
        }
      />
    );
  }

  const environments = job.environments ?? {};
  const containers = job.containers ?? [];
  const attachedFiles = job.attached_files ?? [];
  const recentRuns = runsQuery.data ?? [];
  const tokens = tokensQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Job details"
        title={job.title}
        description={job.description || 'No description provided.'}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/jobs">
                <ArrowLeft className="h-4 w-4" />
                Jobs
              </Link>
            </Button>

            <Button variant="outline" asChild>
              <Link to="/jobs/$jobId/edit" params={{ jobId }}>
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
            </Button>

            <Button variant="outline" asChild>
              <Link to="/jobs/$jobId/runs" params={{ jobId }}>
                <History className="h-4 w-4" />
                Runs
              </Link>
            </Button>

            <Button variant="outline" asChild>
              <Link to="/jobs/$jobId/tokens" params={{ jobId }}>
                <KeyRound className="h-4 w-4" />
                Tokens
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>
                Top-level job metadata and runtime configuration.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Language
                  </div>
                  <div className="mt-1 font-medium">{job.execution_language}</div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Entrypoint
                  </div>
                  <div className="mt-1 font-medium">{job.entrypoint || '—'}</div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Created
                  </div>
                  <div className="mt-1 font-medium">{formatDateTime(job.created_at)}</div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Updated
                  </div>
                  <div className="mt-1 font-medium">{formatRelative(job.updated_at)}</div>
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Environment
                </div>

                <div className="mt-2 grid gap-2">
                  {Object.entries(environments).length ? (
                    Object.entries(environments).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-2xl bg-muted/70 px-3 py-2 font-mono text-xs"
                      >
                        <span>{key}</span>
                        <span className="truncate text-muted-foreground">{value}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      No environment variables.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Containers
                </div>

                <div className="mt-2 space-y-2">
                  {containers.length ? (
                    containers.map((container) => {
                      const isLargeImage = container.image?.includes('cloud-forge-worker-qwen-7b');
                      return (
                        <div
                          key={`${container.name}-${container.image}`}
                          className={cn(
                            'rounded-2xl border border-border px-3 py-3',
                            container.is_parent && 'border-primary/50 bg-primary/5'
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium flex items-center gap-2">
                                {container.name}
                                {container.is_parent && (
                                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                                    Bootstrap
                                  </span>
                                )}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {container.image}
                              </div>
                            </div>

                            {isLargeImage && (
                              <div className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 border border-amber-100 shrink-0">
                                50GB+ MODEL
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      No extra containers configured.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Attached files</CardTitle>
            </CardHeader>

            <CardContent className="space-y-2">
              {attachedFiles.length ? (
                attachedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between rounded-2xl border border-border px-3 py-3"
                  >
                    <div>
                      <div className="font-medium">{file.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatFileSize(file.size_bytes)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No files attached.</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <CodeBlock code={job.execution_code || ''} language={job.execution_language} />

          <Card>
            <CardHeader>
              <CardTitle>Recent runs</CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {recentRuns.length ? (
                recentRuns.slice(0, 5).map((run) => (
                  <Link
                    key={run.id}
                    to="/runs/$runId"
                    params={{ runId: run.id }}
                    className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 transition hover:bg-accent"
                  >
                    <div>
                      <p className="font-medium">{run.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatRelative(run.created_at)}
                      </p>
                    </div>
                    <RunStatusBadge status={run.status} />
                  </Link>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No runs recorded.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Share tokens</CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {tokens.length ? (
                tokens.slice(0, 5).map((token) => (
                  <div
                    key={token.id}
                    className="flex items-center justify-between rounded-2xl border border-border px-4 py-3"
                  >
                    <div>
                      <p className="font-medium">{token.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {token.revoked ? 'Revoked' : `${token.claim_count} claim(s)`}
                      </p>
                    </div>

                    <Button variant="outline" size="sm" asChild>
                      <Link to="/jobs/$jobId/tokens" params={{ jobId }}>
                        Manage
                      </Link>
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No share tokens yet.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}