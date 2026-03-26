import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Layers,
  Zap,
  Clock,
  Play,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChevronRight,
  Plus
} from 'lucide-react';
import { Link } from '@tanstack/react-router';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { dashboardApi, type RunStatus } from '@/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/shared/utils';

const STATUS_COLORS: Record<RunStatus, string> = {
  created: '#94a3b8',
  pending: '#f59e0b',
  running: '#3b82f6',
  completed: '#22c55e',
  failed: '#ef4444',
  cancelled: '#64748b',
  lost: '#475569',
};

const STATUS_LABELS: Record<RunStatus, string> = {
  created: 'Created',
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  lost: 'Lost',
};

export function DashboardPage() {
  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: dashboardApi.getSummary,
  });

  const { data: activeRuns, isLoading: isRunsLoading } = useQuery({
    queryKey: ['active-runs'],
    queryFn: dashboardApi.getActiveRuns,
  });

  const { data: recentEvents, isLoading: isEventsLoading } = useQuery({
    queryKey: ['recent-events'],
    queryFn: dashboardApi.getRecentEvents,
  });

  const pieData = summary ? Object.entries(summary.runs_by_status).map(([status, count]) => ({
    name: STATUS_LABELS[status as RunStatus],
    value: count,
    color: STATUS_COLORS[status as RunStatus],
  })).filter(d => d.value > 0) : [];

  const stats = [
    { label: 'Total Jobs', value: summary?.jobs_total ?? 0, icon: Layers, color: 'text-blue-500' },
    { label: 'Total Runs', value: summary?.runs_total ?? 0, icon: Activity, color: 'text-purple-500' },
    { label: 'Workers Online', value: `${summary?.workers_online ?? 0}/${summary?.workers_total ?? 0}`, icon: Zap, color: 'text-green-500' },
    { label: 'Active Runs', value: activeRuns?.length ?? 0, icon: Play, color: 'text-blue-400' },
  ];

  const getStatusIcon = (status: RunStatus) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed': return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'running': return <Activity className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'cancelled': return <XCircle className="h-4 w-4 text-slate-500" />;
      default: return <Clock className="h-4 w-4 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your Cloud Forge infrastructure.</p>
        </div>
        <Button asChild className="gap-2 shadow-lg hover:shadow-xl transition-all">
          {/* @ts-ignore */}
          <Link to="/jobs/create">
            <Plus className="h-4 w-4" /> Create Job
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={i} className="overflow-hidden border-none shadow-sm hover:shadow-md transition-shadow bg-background/50 backdrop-blur">
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0">
                <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                <stat.icon className={cn("h-4 w-4", stat.color)} />
              </div>
              <div className="flex items-baseline space-x-2">
                <h2 className="text-3xl font-bold mt-2">{isSummaryLoading ? '...' : stat.value}</h2>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 border-none shadow-sm bg-background/50 backdrop-blur">
          <CardHeader>
            <CardTitle>Run Distribution</CardTitle>
            <CardDescription>Visual breakdown of job executions by status.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
             {isSummaryLoading ? (
               <div className="h-full flex items-center justify-center italic text-muted-foreground">Loading chart...</div>
             ) : pieData.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                   <Pie
                     data={pieData}
                     cx="50%"
                     cy="50%"
                     innerRadius={60}
                     outerRadius={100}
                     paddingAngle={5}
                     dataKey="value"
                   >
                     {pieData.map((entry, index) => (
                       <Cell key={`cell-${index}`} fill={entry.color} />
                     ))}
                   </Pie>
                   <Tooltip
                     contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                     itemStyle={{ fontSize: '12px' }}
                   />
                 </PieChart>
               </ResponsiveContainer>
             ) : (
               <div className="h-full flex items-center justify-center italic text-muted-foreground">No data available</div>
             )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 border-none shadow-sm bg-background/50 backdrop-blur">
          <CardHeader>
            <CardTitle>Active Executions</CardTitle>
            <CardDescription>Jobs currently running in the cloud.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isRunsLoading ? (
                [1, 2, 3].map(i => <div key={i} className="h-12 w-full bg-muted animate-pulse rounded-lg" />)
              ) : activeRuns?.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground italic">No active runs</div>
              ) : (
                activeRuns?.map((run) => (
                  <Link
                    key={run.id}
                    // @ts-ignore
                    to={`/runs/${run.id}`}
                    className="flex items-center justify-between p-3 rounded-xl border hover:bg-accent transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                      <div>
                        <p className="text-sm font-bold truncate max-w-[150px]">{run.job_title || 'Untitled Job'}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{run.id.slice(0, 8)}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-1" />
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-7 border-none shadow-sm bg-background/50 backdrop-blur overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>System-wide audit trail of events.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isEventsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map(i => <div key={i} className="h-10 w-full bg-muted animate-pulse rounded-lg" />)}
                </div>
              ) : recentEvents?.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground italic">No recent events recorded.</div>
              ) : (
                <div className="rounded-lg border divide-y overflow-hidden">
                  {recentEvents?.map((event, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                      <div className={cn(
                        "p-2 rounded-full",
                        event.type === 'error' ? "bg-red-500/10" : "bg-blue-500/10"
                      )}>
                        {event.status ? getStatusIcon(event.status as RunStatus) : <Activity className="h-4 w-4 text-blue-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-none">{event.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {event.state?.status ? `Status changed to ${event.state.status}` : event.details || 'Event logged'}
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                        {event.created_at ? formatDistanceToNow(new Date(event.created_at), { addSuffix: true }) : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
