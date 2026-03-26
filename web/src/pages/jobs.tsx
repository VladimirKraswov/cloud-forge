import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  Copy,
  Trash2,
  Edit,
  Activity,
  Layers,
  Clock,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { jobsApi, type RunStatus } from '@/api';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/shared/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/shared/components/ui/dropdown-menu';
import { Badge } from '@/shared/components/ui/badge';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/shared/utils';

export function JobsListPage() {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['jobs', search],
    queryFn: () => jobsApi.list({ search }),
  });

  const cloneMutation = useMutation({
    mutationFn: (id: string) => jobsApi.clone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Job architecture cloned successfully');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => jobsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Job deleted successfully');
    },
  });

  const getStatusBadge = (status?: RunStatus | null) => {
    if (!status) return <Badge variant="secondary" className="bg-slate-100 text-slate-400 border-none font-medium text-[10px]">No Runs</Badge>;

    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500 hover:bg-green-600 border-none font-medium text-[10px]">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="border-none font-medium text-[10px]">Failed</Badge>;
      case 'running':
        return <Badge className="bg-blue-500 animate-pulse border-none font-medium text-[10px]">Running</Badge>;
      default:
        return <Badge variant="outline" className="border-slate-200 text-slate-500 font-medium text-[10px] capitalize">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Jobs</h1>
          <p className="text-muted-foreground">Manage your cloud tasks and their execution parameters.</p>
        </div>
        <Button asChild className="gap-2 shadow-lg">
          <Link to="/jobs/create">
            <Plus className="h-4 w-4" /> New Job
          </Link>
        </Button>
      </div>

      <Card className="border-none shadow-sm overflow-hidden bg-background/50 backdrop-blur">
        <div className="p-4 border-b flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-96 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Search by title or description..."
              className="pl-10 bg-background/50 border-muted focus:bg-background transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2 text-xs h-9">
              <Filter className="h-3.5 w-3.5" /> Filters
            </Button>
            <div className="h-4 w-px bg-muted mx-2" />
            <p className="text-xs text-muted-foreground font-medium">Total: <span className="text-foreground">{data?.total ?? 0}</span></p>
          </div>
        </div>

        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent border-none">
              <TableHead className="w-[40%] font-bold text-xs uppercase tracking-wider py-4">Title</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider py-4">Latest Execution</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider py-4">Runs</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider py-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [1, 2, 3, 4, 5].map(i => (
                <TableRow key={i}>
                  <TableCell colSpan={4}><div className="h-12 w-full bg-muted/50 animate-pulse rounded-lg" /></TableCell>
                </TableRow>
              ))
            ) : data?.jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-64 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Layers className="h-10 w-10 opacity-20" />
                    <p className="text-lg font-semibold">No jobs found</p>
                    <p className="text-sm">Create your first job to start orchestrating tasks.</p>
                    <Button variant="outline" className="mt-4" asChild>
                      <Link to="/jobs/create">Create Job</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data?.jobs.map((job) => (
                <TableRow key={job.id} className="group hover:bg-muted/20 transition-colors border-muted/50">
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                         <Layers className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <Link
                          // @ts-ignore
                          to={`/jobs/${job.id}`}
                          className="font-bold text-foreground hover:text-primary transition-colors block truncate"
                        >
                          {job.title}
                        </Link>
                        <p className="text-xs text-muted-foreground truncate max-w-[300px] mt-0.5">{job.description || 'No description'}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1.5">
                      {getStatusBadge(job.latest_run_status)}
                      {job.latest_run_at && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(job.latest_run_at), { addSuffix: true })}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                       <Badge variant="outline" className="h-7 px-2 font-mono text-[10px] border-muted bg-background/50">
                         {job.runs_count} Total
                       </Badge>
                       {job.active_runs_count > 0 && (
                         <Badge className="h-7 px-2 bg-blue-500 hover:bg-blue-600 border-none animate-pulse text-[10px]">
                           {job.active_runs_count} Active
                         </Badge>
                       )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10" asChild>
                         {/* @ts-ignore */}
                         <Link to={`/jobs/${job.id}`}><ChevronRight className="h-4 w-4" /></Link>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 shadow-xl border-muted">
                          <DropdownMenuItem asChild className="gap-2 cursor-pointer">
                             {/* @ts-ignore */}
                             <Link to={`/jobs/${job.id}`}><ExternalLink className="h-4 w-4" /> View Details</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild className="gap-2 cursor-pointer">
                             {/* @ts-ignore */}
                             <Link to={`/jobs/${job.id}/edit`}><Edit className="h-4 w-4" /> Edit Configuration</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => cloneMutation.mutate(job.id)}>
                            <Copy className="h-4 w-4" /> Clone Job
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2 text-destructive cursor-pointer hover:bg-destructive/10" onClick={() => {
                            if (confirm('Are you sure you want to delete this job and all its runs?')) deleteMutation.mutate(job.id);
                          }}>
                            <Trash2 className="h-4 w-4" /> Delete Permanently
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <Card className="p-6 border-none shadow-sm bg-blue-500/5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
               <Activity className="h-6 w-6 text-blue-500" />
            </div>
            <div>
               <p className="text-xs font-bold uppercase text-blue-500 tracking-wider">Active Infrastructure</p>
               <h3 className="text-2xl font-bold">4 Running</h3>
            </div>
         </Card>
         <Card className="p-6 border-none shadow-sm bg-green-500/5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
               <PlayIcon className="h-6 w-6 text-green-500" />
            </div>
            <div>
               <p className="text-xs font-bold uppercase text-green-500 tracking-wider">Success Rate (24h)</p>
               <h3 className="text-2xl font-bold">98.2%</h3>
            </div>
         </Card>
         <Card className="p-6 border-none shadow-sm bg-zinc-500/5 flex items-center gap-4 border border-dashed border-muted">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
               <Layers className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1">
               <p className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Storage Used</p>
               <div className="w-full bg-muted h-1.5 rounded-full mt-2">
                  <div className="bg-primary h-full w-[45%] rounded-full" />
               </div>
            </div>
         </Card>
      </div>
    </div>
  );
}

// Re-using Card components for brevity in list
function Card({ children, className }: { children: React.ReactNode, className?: string }) {
  return <div className={cn("bg-card rounded-2xl border shadow-sm", className)}>{children}</div>;
}

function PlayIcon({ className }: { className?: string }) {
   return (
     <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
       <polygon points="6 3 20 12 6 21 6 3"/>
     </svg>
   )
}
