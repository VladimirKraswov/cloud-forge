import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, FileCode2, FolderOpen, History, KeyRound, Pencil } from 'lucide-react';
import { jobsApi } from '@/api/jobs';
import { CodeBlock } from '@/shared/components/app/code-block';
import { EmptyState } from '@/shared/components/app/empty-state';
import { PageHeader } from '@/shared/components/app/page-header';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { formatDateTime, formatRelative } from '@/shared/utils/format';

const TEXT_EXTENSIONS = ['py', 'js', 'ts', 'tsx', 'json', 'yaml', 'yml', 'sh', 'md', 'txt'];

function isPreviewable(path: string, mimeType: string) {
  if (mimeType.startsWith('text/')) return true;
  if (mimeType === 'application/json') return true;
  const ext = path.split('.').pop()?.toLowerCase();
  return ext ? TEXT_EXTENSIONS.includes(ext) : false;
}

export function JobDetailsPage() {
  const { jobId } = useParams({ from: '/jobs/$jobId' });
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const jobQuery = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => jobsApi.get(jobId),
  });

  const selectedFile = useMemo(() => {
    const files = jobQuery.data?.files || [];
    return files.find((file) => file.relative_path === selectedPath) || files[0] || null;
  }, [jobQuery.data?.files, selectedPath]);

  const fileContentQuery = useQuery({
    queryKey: ['job', jobId, 'file-content', selectedFile?.relative_path],
    queryFn: () => jobsApi.getFileContent(jobId, selectedFile!.relative_path),
    enabled: Boolean(selectedFile && isPreviewable(selectedFile.relative_path, selectedFile.mime_type)),
  });

  useEffect(() => {
    if (!selectedPath && jobQuery.data?.files?.[0]?.relative_path) {
      setSelectedPath(jobQuery.data.files[0].relative_path);
    }
  }, [jobQuery.data?.files, selectedPath]);

  if (jobQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24" />
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-[620px]" />
          </div>
        </div>
      </div>
    );
  }

  const response = jobQuery.data;

  if (!response) {
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

  const { job, bootstrap_image: bootstrapImage, files, share_tokens: shareTokens, stats } =
    response;

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
              <CardTitle>Runtime configuration</CardTitle>
              <CardDescription>
                Bootstrap image, entrypoint and remote execution settings.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Entrypoint
                  </div>
                  <div className="mt-1 font-medium">{job.entrypoint}</div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Working directory
                  </div>
                  <div className="mt-1 font-medium">{job.working_dir || '/workspace'}</div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Entry arguments
                  </div>
                  <div className="mt-1 font-medium">
                    {job.entrypoint_args.length ? job.entrypoint_args.join(' ') : '—'}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Created
                  </div>
                  <div className="mt-1 font-medium">{formatDateTime(job.created_at)}</div>
                </div>
              </div>

              {bootstrapImage ? (
                <div className="rounded-2xl border border-border bg-muted/50 p-4">
                  <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                    Bootstrap image
                  </div>
                  <div className="font-medium">{bootstrapImage.name}</div>
                  <div className="text-xs text-muted-foreground">{bootstrapImage.full_image_name}</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Base image
                      </div>
                      <div className="mt-1">{bootstrapImage.base_image}</div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Environments
                      </div>
                      <div className="mt-1">{bootstrapImage.environments.length}</div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Environment variables
                </div>

                <div className="mt-2 grid gap-2">
                  {Object.entries(job.environment_variables || {}).length ? (
                    Object.entries(job.environment_variables).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-2xl bg-muted/70 px-3 py-2 font-mono text-xs"
                      >
                        <span>{key}</span>
                        <span className="truncate text-muted-foreground">{value}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground">No environment variables.</div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Total runs
                  </div>
                  <div className="mt-1 font-medium">{stats.total_runs}</div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Active runs
                  </div>
                  <div className="mt-1 font-medium">{stats.active_runs}</div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Share tokens
                  </div>
                  <div className="mt-1 font-medium">{shareTokens.length}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Workspace files</CardTitle>
            </CardHeader>

            <CardContent className="space-y-2">
              {files.length ? (
                files.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => setSelectedPath(file.relative_path)}
                    className={`flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition ${
                      selectedFile?.id === file.id
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{file.relative_path}</div>
                      <div className="text-xs text-muted-foreground">
                        {file.source_type} · {file.mime_type}
                      </div>
                    </div>

                    <div className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                      {file.is_executable ? 'exec' : 'file'}
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No workspace files yet.</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {selectedFile ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileCode2 className="h-4 w-4 text-primary" />
                {selectedFile.relative_path}
              </div>

              {isPreviewable(selectedFile.relative_path, selectedFile.mime_type) ? (
                <CodeBlock
                  code={fileContentQuery.data || selectedFile.inline_content || ''}
                  language={selectedFile.relative_path.split('.').pop() || 'text'}
                />
              ) : (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    This file is not previewable as text in the UI. It will still be downloaded by the remote worker at runtime.
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No files registered for this job.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
