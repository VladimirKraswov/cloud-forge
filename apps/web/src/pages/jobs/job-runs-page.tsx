import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, History } from 'lucide-react';
import { jobsApi } from '@/api/jobs';
import { RunStatusBadge } from '@/entities/runs/ui/run-status-badge';
import { EmptyState } from '@/shared/components/app/empty-state';
import { PageHeader } from '@/shared/components/app/page-header';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { useI18n } from '@/shared/lib/i18n';
import { formatDateTime, formatRelative } from '@/shared/utils/format';

export function JobRunsPage() {
  const { t } = useI18n();
  const { jobId } = useParams({ from: '/jobs/$jobId/runs' });

  const runsQuery = useQuery({
    queryKey: ['job', jobId, 'runs'],
    queryFn: () => jobsApi.listRuns(jobId),
    refetchInterval: 5_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.runs.details.jobRuns}
        title={t.runs.details.history}
        description={t.runs.details.historyDesc}
        actions={
          <Button variant="outline" asChild>
            <Link to="/jobs/$jobId" params={{ jobId }}>
              <ArrowLeft className="h-4 w-4" />
              {t.navigation.backToJobs}
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {runsQuery.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.runs.details.table.run}</TableHead>
                  <TableHead>{t.common.status}</TableHead>
                  <TableHead>{t.runs.details.table.stage}</TableHead>
                  <TableHead>{t.runs.details.table.worker}</TableHead>
                  <TableHead>{t.runs.details.table.started}</TableHead>
                  <TableHead>{t.runs.details.table.finished}</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {runsQuery.data.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <Link
                        to="/runs/$runId"
                        params={{ runId: run.id }}
                        className="font-medium hover:text-primary"
                      >
                        {run.id}
                      </Link>
                    </TableCell>

                    <TableCell>
                      <RunStatusBadge status={run.status} />
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {run.stage || '—'}
                      {typeof run.progress === 'number' ? ` · ${run.progress}%` : ''}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {run.worker_name || run.worker_id || '—'}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {run.started_at ? formatDateTime(run.started_at) : formatRelative(run.created_at)}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {run.finished_at ? formatDateTime(run.finished_at) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-6">
              <EmptyState
                icon={History}
                title={t.jobs.table.noRuns}
                description={t.dashboard.empty.nothingRunningDesc}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
