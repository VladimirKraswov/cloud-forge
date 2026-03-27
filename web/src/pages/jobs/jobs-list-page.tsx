import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Copy, Layers, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { jobsApi } from '@/api/jobs';
import type { RunStatus } from '@/api/types';
import { RunStatusBadge } from '@/entities/runs/ui/run-status-badge';
import { EmptyState } from '@/shared/components/app/empty-state';
import { PageHeader } from '@/shared/components/app/page-header';
import { PaginationControls } from '@/shared/components/app/pagination-controls';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/shared/components/ui/alert-dialog';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu';
import { Input } from '@/shared/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { formatRelative } from '@/shared/utils/format';

const pageSize = 10;

export function JobsListPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | RunStatus>('all');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['jobs', { search, status, page }],
    queryFn: () =>
      jobsApi.list({
        search: search || undefined,
        status: status === 'all' ? undefined : status,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
  });

  const cloneMutation = useMutation({
    mutationFn: (jobId: string) => jobsApi.clone(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Job cloned');
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (jobId: string) => jobsApi.delete(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Job deleted');
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const rows = useMemo(() => query.data?.jobs ?? [], [query.data?.jobs]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Jobs"
        title="Jobs"
        description="Search, filter, paginate, clone, and delete bootstrap-image jobs from a single control surface."
        actions={
          <Button asChild>
            <Link to="/jobs/create">
              <Plus className="h-4 w-4" />
              New job
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search by title or description"
                className="pl-10"
              />
            </div>

            <div className="w-full lg:w-56">
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value as typeof status);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by run status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="finished">Finished</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {query.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : rows.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Bootstrap image</TableHead>
                    <TableHead>Entrypoint</TableHead>
                    <TableHead>Latest run</TableHead>
                    <TableHead>Runs</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {rows.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <Link
                            to="/jobs/$jobId"
                            params={{ jobId: job.id }}
                            className="font-medium hover:text-primary"
                          >
                            {job.title}
                          </Link>
                          <p className="max-w-xl truncate text-sm text-muted-foreground">
                            {job.description || 'No description'}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground">
                        {job.bootstrap_image_name || '—'}
                      </TableCell>

                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {job.entrypoint}
                      </TableCell>

                      <TableCell>
                        {job.latest_run_status ? (
                          <div className="space-y-1">
                            <RunStatusBadge status={job.latest_run_status} />
                            <div className="text-xs text-muted-foreground">
                              {job.latest_run_at ? formatRelative(job.latest_run_at) : '—'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">No runs yet</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="text-sm font-medium">
                          {job.runs_count ?? 0}
                          {job.active_runs_count ? (
                            <span className="ml-2 text-xs text-primary">
                              ({job.active_runs_count} active)
                            </span>
                          ) : null}
                        </div>
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground">
                        {formatRelative(job.updated_at)}
                      </TableCell>

                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to="/jobs/$jobId/edit" params={{ jobId: job.id }}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </Link>
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={() => cloneMutation.mutate(job.id)}>
                              <Copy className="mr-2 h-4 w-4" />
                              Clone
                            </DropdownMenuItem>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onSelect={(event) => event.preventDefault()}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </AlertDialogTrigger>

                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete job?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This removes the job, its files, runs, logs, artifacts, and share tokens.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>

                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteMutation.mutate(job.id)}>
                                    Delete job
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <PaginationControls
                page={page}
                pageSize={pageSize}
                total={query.data?.total ?? 0}
                onPageChange={setPage}
              />
            </>
          ) : (
            <EmptyState
              icon={Layers}
              title="No jobs found"
              description="Try adjusting filters or create the first job for this workspace."
              action={
                <Button asChild>
                  <Link to="/jobs/create">Create job</Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
