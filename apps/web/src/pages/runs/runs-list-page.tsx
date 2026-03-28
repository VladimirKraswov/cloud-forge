import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Play,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { runsApi } from '@/api/runs';
import type { RunStatus } from '@/api/types';
import { RunStatusBadge } from '@/entities/runs/ui/run-status-badge';
import { PageHeader } from '@/shared/components/app/page-header';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
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
import { useI18n } from '@/shared/lib/i18n';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { formatDateTime, formatRelative } from '@/shared/utils/format';

export function RunsListPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<RunStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const limit = 15;

  const runsQuery = useQuery({
    queryKey: ['runs', { search, status, sortBy, sortDir, page }],
    queryFn: () =>
      runsApi.list({
        search: search || undefined,
        status: status === 'all' ? undefined : status,
        sort_by: sortBy,
        sort_dir: sortDir,
        offset: page * limit,
        limit,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (runId: string) => runsApi.delete(runId),
    onSuccess: () => {
      toast.success(t.common.deleted);
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const totalPages = Math.ceil((runsQuery.data?.total || 0) / limit);

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
    setPage(0);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return <ArrowUpDown className="ml-2 h-4 w-4" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="ml-2 h-4 w-4 text-primary" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4 text-primary" />
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.runs.title}
        description={t.runs.listDescription}
      />

      <Card>
        <CardContent className="pt-6">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t.navigation.searchPlaceholder}
                className="pl-10"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </div>

            <Select
              value={status}
              onValueChange={(val) => {
                setStatus(val as any);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder={t.status.all} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.status.all}</SelectItem>
                <SelectItem value="created">{t.status.created}</SelectItem>
                <SelectItem value="running">{t.status.running}</SelectItem>
                <SelectItem value="finished">{t.status.finished}</SelectItem>
                <SelectItem value="failed">{t.status.failed}</SelectItem>
                <SelectItem value="cancelled">{t.status.cancelled}</SelectItem>
                <SelectItem value="lost">{t.status.lost}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      className="flex items-center hover:text-primary"
                      onClick={() => toggleSort('title')}
                    >
                      {t.runs.details.table.run}
                      <SortIcon field="title" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      className="flex items-center hover:text-primary"
                      onClick={() => toggleSort('status')}
                    >
                      {t.common.status}
                      <SortIcon field="status" />
                    </button>
                  </TableHead>
                  <TableHead>{t.runs.details.table.stage}</TableHead>
                  <TableHead>{t.runs.details.table.worker}</TableHead>
                  <TableHead>
                    <button
                      className="flex items-center hover:text-primary"
                      onClick={() => toggleSort('created_at')}
                    >
                      {t.runs.details.table.started}
                      <SortIcon field="created_at" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runsQuery.isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}>
                        <div className="h-12 w-full animate-pulse rounded-lg bg-muted/50" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : runsQuery.data?.items.length ? (
                  runsQuery.data.items.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <Link
                            to="/runs/$runId"
                            params={{ runId: run.id }}
                            className="font-medium hover:underline"
                          >
                            {run.job_title || run.job_id}
                          </Link>
                          <span className="text-xs text-muted-foreground">{run.id}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <RunStatusBadge status={run.status} />
                      </TableCell>
                      <TableCell>
                        {run.stage ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-sm">{run.stage}</span>
                            {typeof run.progress === 'number' && (
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full bg-primary transition-all"
                                  style={{ width: `${run.progress}%` }}
                                />
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {run.worker_name || run.worker_id || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col text-sm text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3 w-3" />
                            {run.started_at ? formatDateTime(run.started_at) : formatDateTime(run.created_at)}
                          </div>
                          <span className="text-xs">{formatRelative(run.started_at || run.created_at)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                           <Button variant="ghost" size="icon" asChild>
                            <Link to="/runs/$runId" params={{ runId: run.id }}>
                              <Play className="h-4 w-4" />
                            </Link>
                          </Button>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive"
                                disabled={run.status === 'running'}
                              >
                                <Trash2 className="h-4 w-4" />
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
                                  onClick={() => deleteMutation.mutate(run.id)}
                                >
                                  {t.common.delete}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No runs found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t.common.pageOf
                  .replace('{page}', String(page + 1))
                  .replace('{pages}', String(totalPages))
                  .replace('{total}', String(runsQuery.data?.total || 0))}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t.common.prev}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                >
                  {t.common.next}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
