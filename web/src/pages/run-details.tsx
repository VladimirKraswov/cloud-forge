import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Terminal,
  Play,
  XCircle,
  Clock,
  Server,
  Activity,
  Hash,
  FileText,
  AlertCircle,
  Package,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import { runsApi } from '@/api';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/components/ui/tabs';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/shared/utils';

export function RunDetailsPage() {
  const params = (useParams as any)({
    strict: false,
    from: '/runs/$runId'
  } as any);

  const runId = params?.runId as string;
  const queryClient = useQueryClient();
  const [logs, setLogs] = useState<string[]>([]);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const { data: run, isLoading, error, status: queryStatus } = useQuery({
    queryKey: ['run', runId],
    queryFn: () => runsApi.get(runId),
    refetchInterval: (query: any) => (query.state.data?.state?.status === 'running' || query.state.data?.state?.status === 'pending') ? 2000 : false,
  });

  const { data: runLogs } = useQuery({
    queryKey: ['run-logs', runId],
    queryFn: () => runsApi.getLogs(runId),
    enabled: !!run && (run.state.status !== 'running'), // Only fetch static logs if not running
  });

  const cancelMutation = useMutation({
    mutationFn: () => runsApi.cancel(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['run', runId] });
      toast.success('Run cancellation requested');
    },
    onError: (err: any) => {
      toast.error(`Failed to cancel run: ${err.response?.data?.message || err.message}`);
    }
  });

  // WebSocket for Live Logs
  useEffect(() => {
    if (run?.state?.status === 'running') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = import.meta.env.VITE_API_BASE_URL?.replace(/^https?:\/\//, '') || window.location.host;
      const wsUrl = `${protocol}//${host}/ws/runs/${runId}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      setWsStatus('connecting');

      ws.onopen = () => setWsStatus('open');
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'log') {
             setLogs(prev => [...prev, data.message]);
          }
        } catch (e) {
          setLogs(prev => [...prev, event.data]);
        }
      };
      ws.onerror = () => setWsStatus('error');
      ws.onclose = () => setWsStatus('closed');

      return () => {
        ws.close();
      };
    }
  }, [runId, run?.state?.status]);

  // Handle static logs
  useEffect(() => {
    if (runLogs && Array.isArray(runLogs)) {
       setLogs(runLogs.map(l => l.message));
    }
  }, [runLogs]);

  // Auto-scroll logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  if (isLoading || queryStatus === 'pending') return <div className="p-8 text-center animate-pulse">Loading execution details...</div>;
  if (error || !run) return (
    <div className="p-8 flex flex-col items-center justify-center gap-4 border border-dashed rounded-xl">
       <AlertCircle className="h-10 w-10 text-destructive" />
       <p className="text-lg font-semibold">Run not found</p>
       <Button variant="outline" asChild><Link to="/jobs">Back to Jobs</Link></Button>
    </div>
  );

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    running: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    completed: 'bg-green-500/10 text-green-500 border-green-500/20',
    failed: 'bg-red-500/10 text-red-500 border-red-500/20',
    cancelled: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild className="rounded-full">
             {/* @ts-ignore */}
             <Link to={`/jobs/${run.job_id}`}><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
               <h1 className="text-2xl font-bold tracking-tight">Run #{run.id.slice(0, 8)}</h1>
               <Badge className={cn("capitalize border", statusColors[run.state.status] || 'bg-zinc-500')}>
                 {run.state.status}
               </Badge>
            </div>
            <p className="text-muted-foreground text-sm">Execution of {run.job_title || 'Job'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           {run.state.status === 'running' && (
              <Button variant="destructive" size="sm" className="gap-2" onClick={() => cancelMutation.mutate()}>
                 <XCircle className="h-4 w-4" /> Cancel Run
              </Button>
           )}
           <Button variant="outline" size="sm" className="gap-2" onClick={() => queryClient.invalidateQueries({ queryKey: ['run', runId] })}>
              <RefreshCw className="h-3 w-3" /> Refresh
           </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Stats */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="bg-muted/30 border-none">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1 font-bold uppercase tracking-wider">
                   <Clock className="h-3 w-3" /> Duration
                </div>
                <div className="text-lg font-mono">
                   {run.state.finished_at && run.state.started_at
                      ? `${((new Date(run.state.finished_at).getTime() - new Date(run.state.started_at).getTime()) / 1000).toFixed(1)}s`
                      : run.state.started_at ? 'Running...' : '-'}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-muted/30 border-none">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1 font-bold uppercase tracking-wider">
                   <Activity className="h-3 w-3" /> Started
                </div>
                <div className="text-sm">
                   {run.state.started_at ? formatDistanceToNow(new Date(run.state.started_at), { addSuffix: true }) : 'Waiting...'}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-muted/30 border-none">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1 font-bold uppercase tracking-wider">
                   <Server className="h-3 w-3" /> Worker
                </div>
                <div className="text-sm truncate" title={run.worker_id || undefined}>
                   {run.worker_id ? `Worker ${run.worker_id.slice(0, 8)}` : 'Assigning...'}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-muted/30 border-none">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1 font-bold uppercase tracking-wider">
                   <Hash className="h-3 w-3" /> Trigger
                </div>
                <div className="text-sm capitalize">
                   {run.trigger_source || 'Manual'}
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="logs" className="w-full">
             <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="logs" className="gap-2">
                   <Terminal className="h-4 w-4" /> Logs
                   {run.state.status === 'running' && <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />}
                </TabsTrigger>
                <TabsTrigger value="artifacts" className="gap-2">
                   <Package className="h-4 w-4" /> Artifacts
                </TabsTrigger>
                <TabsTrigger value="metrics" className="gap-2">
                   <Cpu className="h-4 w-4" /> Resource Usage
                </TabsTrigger>
             </TabsList>

             <TabsContent value="logs" className="mt-4">
                <Card className="bg-zinc-950 border-zinc-800 shadow-2xl overflow-hidden">
                   <CardHeader className="py-3 px-4 border-b border-zinc-800 bg-zinc-900/50 flex flex-row items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                         <div className="flex gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/30" />
                            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/30" />
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/30" />
                         </div>
                         <span className="ml-2">task-output.log</span>
                      </div>
                      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                         {wsStatus === 'open' ? 'Live Stream active' : 'Static view'}
                      </div>
                   </CardHeader>
                   <CardContent className="p-0">
                      <div
                        ref={scrollRef}
                        className="h-[500px] overflow-y-auto p-4 font-mono text-sm leading-relaxed text-zinc-300"
                      >
                         {logs.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-zinc-600 italic">
                               {run.state.status === 'pending' ? 'Waiting for logs to start...' : 'No logs available for this run.'}
                            </div>
                         ) : (
                            logs.map((log, i) => (
                               <div key={i} className="whitespace-pre-wrap mb-1 group flex gap-4">
                                  <span className="text-zinc-600 select-none w-8 shrink-0 text-right text-[10px] mt-1">{i + 1}</span>
                                  <span>{log}</span>
                               </div>
                            ))
                         )}
                         {run.state.status === 'running' && (
                            <div className="flex items-center gap-2 text-blue-400 text-xs mt-2 animate-pulse">
                               <Play className="h-3 w-3 fill-current" />
                               <span>Process is active...</span>
                            </div>
                         )}
                      </div>
                   </CardContent>
                </Card>
             </TabsContent>

             <TabsContent value="artifacts" className="mt-4">
                <Card>
                   <CardContent className="p-8 text-center text-muted-foreground">
                      <FileText className="h-10 w-10 mx-auto mb-4 opacity-20" />
                      <p className="font-semibold text-foreground">No Artifacts Found</p>
                      <p className="text-sm mt-1">Files produced by this run will appear here after completion.</p>
                   </CardContent>
                </Card>
             </TabsContent>

             <TabsContent value="metrics" className="mt-4">
                <Card>
                   <CardHeader>
                      <CardTitle>Peak Utilization</CardTitle>
                      <CardDescription>Observed resource consumption during the run life-cycle.</CardDescription>
                   </CardHeader>
                   <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
                         <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                               <span className="text-muted-foreground font-medium">CPU Usage</span>
                               <span className="font-mono">12%</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                               <div className="h-full bg-primary w-[12%]" />
                            </div>
                         </div>
                         <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                               <span className="text-muted-foreground font-medium">Memory Usage</span>
                               <span className="font-mono">256MB</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                               <div className="h-full bg-primary w-[30%]" />
                            </div>
                         </div>
                      </div>
                   </CardContent>
                </Card>
             </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
           <Card className="shadow-sm">
              <CardHeader className="bg-accent/30 py-4">
                 <CardTitle className="text-sm font-bold uppercase tracking-wider">Execution Metadata</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                 <div className="space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Run ID</p>
                    <p className="text-xs font-mono break-all bg-muted/50 p-2 rounded">{run.id}</p>
                 </div>
                 <div className="space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Job Language</p>
                    <Badge variant="outline" className="font-mono text-[10px]">{run.job_language || 'unknown'}</Badge>
                 </div>
                 {run.state.exit_code !== undefined && (
                   <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">Exit Code</p>
                      <Badge variant={run.state.exit_code === 0 ? 'outline' : 'destructive'} className="font-mono">
                         {run.state.exit_code}
                      </Badge>
                   </div>
                 )}
              </CardContent>
           </Card>

           <Card className="shadow-sm">
              <CardHeader className="bg-accent/30 py-4">
                 <CardTitle className="text-sm font-bold uppercase tracking-wider">Troubleshooting</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                 <p className="text-xs text-muted-foreground leading-relaxed">
                    If this run failed unexpectedly, check the worker status and ensure all required dependencies are installed in the container environment.
                 </p>
                 <Button variant="outline" size="sm" className="w-full text-xs" asChild>
                    {/* @ts-ignore */}
                    <Link to="/workers">Inspect Workers</Link>
                 </Button>
              </CardContent>
           </Card>
        </div>
      </div>
    </div>
  );
}
