import { useQuery } from '@tanstack/react-query';
import {
  Server,
  Cpu,
  MemoryStick as Memory,
  Activity,
  Clock,
  ShieldCheck,
  Search,
  ArrowRight
} from 'lucide-react';
import { workersApi } from '@/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/shared/utils';

export function WorkersPage() {
  const { data: workers, isLoading } = useQuery({
    queryKey: ['workers'],
    queryFn: workersApi.list,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online': return <Badge className="bg-green-500 hover:bg-green-600 border-none">Online</Badge>;
      case 'busy': return <Badge className="bg-blue-500 animate-pulse border-none">Busy</Badge>;
      default: return <Badge variant="secondary" className="border-none">Offline</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workers</h1>
          <p className="text-muted-foreground">Monitor your distributed compute resources.</p>
        </div>
        <div className="flex items-center gap-4 bg-card p-2 rounded-xl border shadow-sm px-4">
           <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-xs font-bold uppercase tracking-wider">{workers?.filter(w => w.status === 'online').length || 0} Online</span>
           </div>
           <div className="h-4 w-px bg-muted" />
           <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-xs font-bold uppercase tracking-wider">{workers?.filter(w => w.status === 'busy').length || 0} Busy</span>
           </div>
        </div>
      </div>

      <div className="relative group max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
        <Input placeholder="Filter nodes by name or capability..." className="pl-10 bg-background" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {isLoading ? (
          [1, 2, 3].map(i => <div key={i} className="h-64 bg-muted animate-pulse rounded-2xl" />)
        ) : workers?.length === 0 ? (
          <div className="col-span-full py-20 text-center border-2 border-dashed rounded-2xl bg-muted/20">
             <Server className="h-10 w-10 mx-auto mb-4 opacity-20" />
             <p className="font-semibold text-muted-foreground">No workers connected to the cluster.</p>
          </div>
        ) : (
          workers?.map((worker) => (
            <Card key={worker.id} className="border-none shadow-sm hover:shadow-md transition-all group overflow-hidden bg-background/50 backdrop-blur">
              <CardHeader className="pb-4 relative">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center transition-colors",
                      worker.status === 'online' ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"
                    )}>
                      <Server className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base truncate max-w-[150px]">{worker.name}</CardTitle>
                      <p className="text-[10px] font-mono text-muted-foreground uppercase">{worker.id.slice(0, 12)}</p>
                    </div>
                  </div>
                  {getStatusBadge(worker.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Capability Badges */}
                <div className="flex flex-wrap gap-1.5">
                   {worker.capabilities?.labels?.map((label: string) => (
                      <Badge key={label} variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-accent/50 border-accent text-accent-foreground font-medium">
                         {label}
                      </Badge>
                   ))}
                   <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-mono">linux/amd64</Badge>
                </div>

                {/* Resource Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                       <div className="flex items-center gap-1"><Cpu className="h-3 w-3" /> CPU</div>
                       <span>{worker.capabilities?.cpu_count || 4} Cores</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                       <div className="h-full bg-primary w-[35%]" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                       <div className="flex items-center gap-1"><Memory className="h-3 w-3" /> Memory</div>
                       <span>{worker.capabilities?.memory_gb || 16}GB</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                       <div className="h-full bg-primary w-[62%]" />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t flex items-center justify-between text-xs">
                   <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Last heartbeat: {worker.last_seen_at ? formatDistanceToNow(new Date(worker.last_seen_at), { addSuffix: true }) : 'Never'}</span>
                   </div>
                   <div className="flex items-center gap-1.5 text-green-600 font-bold">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span className="text-[10px] uppercase">Secure</span>
                   </div>
                </div>
              </CardContent>
              <div className="h-1 w-full bg-muted mt-auto group-hover:bg-primary/20 transition-colors" />
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
