import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from '@tanstack/react-router';
import {
  Play,
  Settings,
  Trash2,
  Copy,
  History,
  Key,
  Code2,
  Clock,
  Activity,
  ArrowRight,
  ArrowLeft,
  Calendar,
  Layers,
  Container,
  Database
} from 'lucide-react';
import { jobsApi, tokensApi } from '@/api';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/shared/utils';

export function JobDetailsPage() {
  const params = (useParams as any)({ strict: false });
  const jobId = params?.jobId as string;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => jobsApi.get(jobId),
  });

  const { data: runs, isLoading: isRunsLoading } = useQuery({
    queryKey: ['job-runs', jobId],
    queryFn: () => jobsApi.getRuns(jobId),
  });

  const { data: tokens, isLoading: isTokensLoading } = useQuery({
    queryKey: ['job-tokens', jobId],
    queryFn: () => tokensApi.list(jobId),
  });

  const cloneMutation = useMutation({
    mutationFn: () => jobsApi.clone(jobId),
    onSuccess: (newJob) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Job cloned successfully');
      // @ts-ignore
      navigate({ to: `/jobs/${newJob.id}` });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => jobsApi.delete(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Job deleted successfully');
      // @ts-ignore
      navigate({ to: '/jobs' });
    },
  });

  const createTokenMutation = useMutation({
    mutationFn: () => tokensApi.create(jobId, { name: 'Default Token' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-tokens', jobId] });
      toast.success('Share token created');
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500 hover:bg-green-600">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'running':
        return <Badge className="bg-blue-500 animate-pulse">Running</Badge>;
      case 'cancelled':
        return <Badge variant="secondary">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) return <div className="p-8 text-center animate-pulse">Loading job architecture...</div>;
  if (!job) return <div className="p-8 text-center">Job not found.</div>;

  return (
    <div className="space-y-8">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild className="rounded-full shadow-sm">
             {/* @ts-ignore */}
             <Link to="/jobs"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
             <div className="flex items-center gap-3">
               <h1 className="text-3xl font-bold tracking-tight">{job.title}</h1>
               <Badge variant="outline" className="font-mono text-xs">{job.execution_language}</Badge>
             </div>
             <p className="text-muted-foreground mt-1 max-w-xl line-clamp-2">{job.description || 'No description provided.'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
           <Button variant="outline" size="sm" className="gap-2" onClick={() => cloneMutation.mutate()}>
              <Copy className="h-4 w-4" /> Clone
           </Button>
           <Button variant="outline" size="sm" className="gap-2" asChild>
              {/* @ts-ignore */}
              <Link to={`/jobs/${jobId}/edit`}><Settings className="h-4 w-4" /> Edit</Link>
           </Button>
           <Button variant="destructive" size="sm" className="gap-2" onClick={() => {
             if (confirm('Are you sure? This will delete all history and artifacts.')) deleteMutation.mutate();
           }}>
              <Trash2 className="h-4 w-4" /> Delete
           </Button>
           <Button className="gap-2 shadow-lg bg-primary hover:bg-primary/90" size="sm">
              <Play className="h-4 w-4 fill-current" /> Run Now
           </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
         {/* Left Side: Navigation Tabs as Cards */}
         <div className="lg:col-span-1 space-y-3">
            {[
               { id: 'overview', name: 'Overview', icon: Activity },
               { id: 'history', name: 'Execution History', icon: History },
               { id: 'access', name: 'Access Control', icon: Key },
            ].map((tab) => (
               <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                     "w-full flex items-center justify-between p-4 rounded-xl text-sm font-medium transition-all group border-2",
                     activeTab === tab.id
                        ? "bg-primary border-primary text-primary-foreground shadow-md"
                        : "bg-background border-transparent hover:border-accent hover:bg-accent/50 text-muted-foreground"
                  )}
               >
                  <div className="flex items-center gap-3">
                     <tab.icon className={cn("h-4 w-4", activeTab === tab.id ? "text-white" : "text-muted-foreground group-hover:text-primary")} />
                     {tab.name}
                  </div>
                  {activeTab === tab.id && <ArrowRight className="h-4 w-4" />}
               </button>
            ))}

            <div className="mt-8 pt-6 border-t">
               <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest mb-4">Metadata</h4>
               <div className="space-y-4">
                  <div className="flex items-center gap-3 text-xs">
                     <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                     <span className="text-muted-foreground">Created:</span>
                     <span className="font-medium">{format(new Date(job.created_at), 'MMM d, yyyy')}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                     <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                     <span className="text-muted-foreground">Updated:</span>
                     <span className="font-medium">{formatDistanceToNow(new Date(job.updated_at), { addSuffix: true })}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                     <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                     <span className="text-muted-foreground">Language:</span>
                     <Badge variant="secondary" className="px-1 py-0 h-4 text-[9px] uppercase">{job.execution_language}</Badge>
                  </div>
               </div>
            </div>
         </div>

         {/* Main Content Area */}
         <div className="lg:col-span-3">
            {activeTab === 'overview' && (
               <div className="space-y-6">
                  {/* Stats Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <Card className="border-none bg-accent/30 shadow-sm">
                        <CardContent className="pt-6">
                           <p className="text-xs font-bold text-muted-foreground uppercase">Total Executions</p>
                           <h3 className="text-2xl font-bold mt-1">{(runs as any)?.length ?? 0}</h3>
                        </CardContent>
                     </Card>
                     <Card className="border-none bg-accent/30 shadow-sm">
                        <CardContent className="pt-6">
                           <p className="text-xs font-bold text-muted-foreground uppercase">Success Rate</p>
                           <h3 className="text-2xl font-bold mt-1">
                              {runs && runs.length > 0
                                 ? `${Math.round((runs.filter(r => r.state.status === 'completed').length / runs.length) * 100)}%`
                                 : '0%'}
                           </h3>
                        </CardContent>
                     </Card>
                     <Card className="border-none bg-accent/30 shadow-sm">
                        <CardContent className="pt-6">
                           <p className="text-xs font-bold text-muted-foreground uppercase">Avg. Duration</p>
                           <h3 className="text-2xl font-bold mt-1">12.4s</h3>
                        </CardContent>
                     </Card>
                  </div>

                  {/* Code Snippet Card */}
                  <Card className="overflow-hidden border shadow-sm">
                     <CardHeader className="bg-muted/50 py-3 flex flex-row items-center justify-between border-b">
                        <div className="flex items-center gap-2">
                           <Code2 className="h-4 w-4 text-muted-foreground" />
                           <span className="text-xs font-bold font-mono text-muted-foreground uppercase">{job.entrypoint || 'source.code'}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono px-2">{job.execution_language}</Badge>
                     </CardHeader>
                     <CardContent className="p-0 bg-zinc-950">
                        <pre className="p-4 text-xs font-mono text-zinc-300 overflow-x-auto leading-relaxed">
                           <code>{job.execution_code}</code>
                        </pre>
                     </CardContent>
                  </Card>

                  {/* Config Panels */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <Card className="shadow-sm border">
                        <CardHeader className="py-4">
                           <CardTitle className="text-sm flex items-center gap-2"><Container className="h-4 w-4" /> Containers</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 border-t">
                           {job.containers.length === 0 ? (
                              <div className="p-6 text-center text-xs text-muted-foreground italic">No side-containers defined.</div>
                           ) : (
                              <div className="divide-y">
                                 {job.containers.map((c, i) => (
                                    <div key={i} className="p-3 flex items-center justify-between">
                                       <div className="min-w-0">
                                          <p className="text-xs font-bold truncate">{c.name}</p>
                                          <p className="text-[10px] text-muted-foreground truncate">{c.image}</p>
                                       </div>
                                       {c.is_parent && <Badge className="text-[9px] h-4">Parent</Badge>}
                                    </div>
                                 ))}
                              </div>
                           )}
                        </CardContent>
                     </Card>

                     <Card className="shadow-sm border">
                        <CardHeader className="py-4">
                           <CardTitle className="text-sm flex items-center gap-2"><Database className="h-4 w-4" /> Environments</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 border-t">
                           {Object.keys(job.environments).length === 0 ? (
                              <div className="p-6 text-center text-xs text-muted-foreground italic">No environments configured.</div>
                           ) : (
                              <div className="divide-y font-mono text-[10px]">
                                 {Object.entries(job.environments).map(([k, v]) => (
                                    <div key={k} className="p-3 flex items-center justify-between">
                                       <span className="text-muted-foreground font-bold">{k}</span>
                                       <span className="truncate max-w-[150px]">{v}</span>
                                    </div>
                                 ))}
                              </div>
                           )}
                        </CardContent>
                     </Card>
                  </div>
               </div>
            )}

            {activeTab === 'history' && (
               <Card className="border-none shadow-sm overflow-hidden">
                  <CardHeader className="bg-muted/30">
                     <CardTitle className="text-lg">Run History</CardTitle>
                     <CardDescription>All executions for this specific job architecture.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                     {isRunsLoading ? (
                        <div className="p-10 text-center animate-pulse text-muted-foreground">Retrieving history...</div>
                     ) : runs?.length === 0 ? (
                        <div className="p-10 text-center text-muted-foreground italic">This job hasn't been executed yet.</div>
                     ) : (
                        <div className="overflow-x-auto">
                           <table className="w-full text-sm">
                              <thead className="bg-muted/50 border-y text-left text-xs font-bold text-muted-foreground uppercase">
                                 <tr>
                                    <th className="px-4 py-3">ID</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Started</th>
                                    <th className="px-4 py-3">Duration</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y">
                                 {runs?.map((run) => (
                                    <tr key={run.id} className="hover:bg-accent/30 transition-colors group">
                                       <td className="px-4 py-3 font-mono text-xs">{run.id.slice(0, 8)}</td>
                                       <td className="px-4 py-3">{getStatusBadge(run.state.status)}</td>
                                       <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                                          {run.state.started_at ? formatDistanceToNow(new Date(run.state.started_at), { addSuffix: true }) : '-'}
                                       </td>
                                       <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                                          {run.state.finished_at && run.state.started_at
                                             ? `${((new Date(run.state.finished_at).getTime() - new Date(run.state.started_at).getTime()) / 1000).toFixed(1)}s`
                                             : '-'}
                                       </td>
                                       <td className="px-4 py-3 text-right">
                                          <Button variant="ghost" size="sm" asChild className="opacity-0 group-hover:opacity-100 transition-opacity">
                                             {/* @ts-ignore */}
                                             <Link to={`/runs/${run.id}`}>Details</Link>
                                          </Button>
                                       </td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                     )}
                  </CardContent>
               </Card>
            )}

            {activeTab === 'access' && (
               <div className="space-y-6">
                  <Card>
                     <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                           <CardTitle>Share Tokens</CardTitle>
                           <CardDescription>Issue long-lived tokens for external orchestration or CLI usage.</CardDescription>
                        </div>
                        <Button size="sm" className="gap-2 shadow-sm" onClick={() => createTokenMutation.mutate()}>
                           <PlusIcon className="h-4 w-4" /> Issue Token
                        </Button>
                     </CardHeader>
                     <CardContent className="p-0 border-t">
                        {isTokensLoading ? (
                           <div className="p-8 text-center animate-pulse">Scanning security layers...</div>
                        ) : tokens?.length === 0 ? (
                           <div className="p-10 text-center text-muted-foreground italic">No active share tokens for this job.</div>
                        ) : (
                           <div className="divide-y">
                              {tokens?.map((token) => (
                                 <div key={token.id} className="p-4 hover:bg-muted/10">
                                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                       <div className="space-y-1">
                                          <div className="flex items-center gap-2">
                                             <p className="font-bold text-sm">{token.name}</p>
                                             {token.revoked_at && <Badge variant="destructive" className="h-4 py-0 text-[8px] uppercase">Revoked</Badge>}
                                          </div>
                                          <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground bg-muted p-1 px-2 rounded w-fit">
                                             {token.id}
                                             <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => {
                                                navigator.clipboard.writeText(token.id);
                                                toast.success('Token ID copied');
                                             }}><Copy className="h-2.5 w-2.5" /></Button>
                                          </div>
                                       </div>
                                       <div className="flex items-center gap-2">
                                          {!token.revoked_at && (
                                             <Button variant="outline" size="sm" className="text-destructive border-destructive/20 hover:bg-destructive/10">Revoke</Button>
                                          )}
                                       </div>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        )}
                     </CardContent>
                  </Card>

                  <Card className="bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/50">
                     <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2 text-blue-800 dark:text-blue-400">
                           <Key className="h-4 w-4" /> CLI Usage
                        </CardTitle>
                     </CardHeader>
                     <CardContent>
                        <div className="bg-zinc-950 p-4 rounded-lg font-mono text-xs text-zinc-300 relative group">
                           <code>
                              cloud-forge execute --job {jobId} --token &lt;YOUR_TOKEN&gt;
                           </code>
                           <Button
                              variant="ghost"
                              size="icon"
                              className="absolute right-2 top-2 h-6 w-6 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => {
                                 navigator.clipboard.writeText(`cloud-forge execute --job ${jobId} --token <TOKEN>`);
                                 toast.success('CLI command copied');
                              }}
                           >
                              <Copy className="h-3 w-3" />
                           </Button>
                        </div>
                     </CardContent>
                  </Card>
               </div>
            )}
         </div>
      </div>
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
   return (
     <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
       <path d="M5 12h14"/><path d="M12 5v14"/>
     </svg>
   )
}
