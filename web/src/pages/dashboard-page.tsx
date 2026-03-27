import { useQuery } from '@tanstack/react-query';
import { Activity, Layers, Play, Server } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Pie, PieChart, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { dashboardApi } from '@/api/dashboard';
import type { RunStatus } from '@/api/types';
import { RunStatusBadge } from '@/entities/runs/ui/run-status-badge';
import { WorkerStatusBadge } from '@/entities/workers/ui/worker-status-badge';
import { EmptyState } from '@/shared/components/app/empty-state';
import { PageHeader } from '@/shared/components/app/page-header';
import { StatCard } from '@/shared/components/app/stat-card';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { formatRelative } from '@/shared/utils/format';

const chartColors: Record<RunStatus, string> = {
  created: '#f59e0b',
  running: '#2563eb',
  finished: '#16a34a',
  failed: '#dc2626',
  cancelled: '#64748b',
  lost: '#7c3aed',
};

export function DashboardPage() {
  const summaryQuery = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: dashboardApi.getSummary,
  });

  const activeRunsQuery = useQuery({
    queryKey: ['dashboard', 'active-runs'],
    queryFn: dashboardApi.getActiveRuns,
    refetchInterval: 5_000,
  });

  const activeWorkersQuery = useQuery({
    queryKey: ['dashboard', 'active-workers'],
    queryFn: dashboardApi.getActiveWorkers,
    refetchInterval: 10_000,
  });

  const recentEventsQuery = useQuery({
    queryKey: ['dashboard', 'recent-events'],
    queryFn: dashboardApi.getRecentEvents,
    refetchInterval: 10_000,
  });

  const pieData = Object.entries(summaryQuery.data?.runs_by_status || {}).map(
    ([status, value]) => ({
      name: status,
      value: value || 0,
      color: chartColors[status as RunStatus],
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations overview"
        title="Dashboard"
        description="Live view across bootstrap images, jobs, runs and worker activity."
        actions={
          <Button asChild>
            <Link to="/jobs/create">Create job</Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Jobs"
          value={summaryQuery.data?.jobs_total ?? '—'}
          subtitle="Registered jobs"
          icon={Layers}
        />
        <StatCard
          title="Runs"
          value={summaryQuery.data?.runs_total ?? '—'}
          subtitle="Historical executions"
          icon={Activity}
        />
        <StatCard
          title="Workers online"
          value={`${summaryQuery.data?.workers_online ?? 0}/${summaryQuery.data?.workers_total ?? 0}`}
          subtitle="Cluster availability"
          icon={Server}
        />
        <StatCard
          title="Active runs"
          value={activeRunsQuery.data?.length ?? 0}
          subtitle="Created or running"
          icon={Play}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Run status distribution</CardTitle>
            <CardDescription>Snapshot of run states across the platform.</CardDescription>
          </CardHeader>

          <CardContent className="h-[320px]">
            {pieData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" innerRadius={72} outerRadius={110}>
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={Activity}
                title="No run data yet"
                description="The chart will populate after remote workers start executing jobs."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active workers</CardTitle>
            <CardDescription>Workers currently online or busy.</CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            {activeWorkersQuery.data?.length ? (
              activeWorkersQuery.data.map((worker) => (
                <div
                  key={worker.id}
                  className="flex items-center justify-between rounded-2xl border border-border bg-muted/50 px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{worker.name}</p>
                    <p className="text-xs text-muted-foreground">{worker.host || worker.id}</p>
                  </div>
                  <WorkerStatusBadge status={worker.status} />
                </div>
              ))
            ) : (
              <EmptyState
                icon={Server}
                title="No active workers"
                description="Workers will appear here after they start sending heartbeats."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Active runs</CardTitle>
            <CardDescription>Recently created or currently executing runs.</CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            {activeRunsQuery.data?.length ? (
              activeRunsQuery.data.map((run) => (
                <Link
                  key={run.id}
                  to="/runs/$runId"
                  params={{ runId: run.id }}
                  className="rounded-2xl border border-border bg-card px-4 py-3 transition hover:bg-accent"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium">
                        {run.job_title || run.run_manifest.job_id}
                      </p>
                      <p className="text-xs text-muted-foreground">{run.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {run.stage || 'idle'}
                        {typeof run.progress === 'number' ? ` · ${run.progress}%` : ''}
                      </p>
                    </div>
                    <RunStatusBadge status={run.status} />
                  </div>
                </Link>
              ))
            ) : (
              <EmptyState
                icon={Play}
                title="Nothing is running"
                description="Once a worker claims a share token, active runs will show here."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent events</CardTitle>
            <CardDescription>Latest terminal state changes across the platform.</CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            {recentEventsQuery.data?.length ? (
              recentEventsQuery.data.map((event, index) => (
                <div
                  key={`${event.created_at}-${index}`}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{event.message}</p>
                    <p className="text-sm text-muted-foreground">
                      {event.details || 'State transition recorded'}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {event.status ? <RunStatusBadge status={event.status} /> : null}
                    <span className="text-xs text-muted-foreground">
                      {formatRelative(event.created_at)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                icon={Activity}
                title="No recent events"
                description="Terminal run events will show here once execution starts."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
