import { useQuery } from '@tanstack/react-query';
import {
  Sparkles,
  Search,
  ArrowRight,
  Play,
  Terminal,
  Layout,
  Layers,
  Cpu,
  Globe,
  Database,
  Shield,
  Zap
} from 'lucide-react';
import { catalogApi } from '@/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Link } from '@tanstack/react-router';

export function CatalogPage() {
  const { data: templates, isLoading } = useQuery({
    queryKey: ['catalog'],
    queryFn: catalogApi.list,
  });

  const categories = [
    { name: 'All Templates', icon: Layout },
    { name: 'Data Processing', icon: Database },
    { name: 'Web Scraping', icon: Globe },
    { name: 'Machine Learning', icon: Cpu },
    { name: 'Security', icon: Shield },
  ];

  const getIcon = (tags: string[] = []) => {
    if (tags.includes('python')) return <Terminal className="h-5 w-5 text-blue-500" />;
    if (tags.includes('javascript')) return <Terminal className="h-5 w-5 text-yellow-500" />;
    return <Layers className="h-5 w-5 text-primary" />;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
             <div className="bg-primary/10 p-1 rounded">
                <Sparkles className="h-4 w-4 text-primary fill-primary/20" />
             </div>
             <span className="text-xs font-bold text-primary uppercase tracking-widest">Marketplace</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight">Catalog</h1>
          <p className="text-muted-foreground mt-2 max-w-lg">
            Jumpstart your automation with production-ready architecture templates and presets.
          </p>
        </div>
        <div className="flex w-full md:w-auto gap-2">
           <div className="relative flex-1 md:w-80 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input placeholder="Search templates..." className="pl-10 bg-background/50 border-muted" />
           </div>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-hide">
         {categories.map((cat, i) => (
            <Button
               key={i}
               variant={i === 0 ? "default" : "outline"}
               size="sm"
               className={cn(
                  "rounded-full gap-2 whitespace-nowrap",
                  i === 0 ? "shadow-md" : "border-muted hover:bg-accent"
               )}
            >
               <cat.icon className="h-3.5 w-3.5" />
               {cat.name}
            </Button>
         ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {isLoading ? (
          [1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-72 bg-muted animate-pulse rounded-3xl" />)
        ) : (
          templates?.map((item) => (
            <Card key={item.id} className="group border-none shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden bg-background/50 backdrop-blur flex flex-col">
              <CardHeader className="pb-4 relative">
                <div className="flex justify-between items-start">
                   <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                      {getIcon(item.tags)}
                   </div>
                   <div className="flex flex-col items-end gap-2">
                      <Badge variant="outline" className="bg-background/80 text-[10px] font-bold">PRESET</Badge>
                      <div className="flex items-center gap-1 text-green-600">
                         <Zap className="h-3 w-3 fill-current" />
                         <span className="text-[10px] font-black uppercase">Optimized</span>
                      </div>
                   </div>
                </div>
                <div className="mt-4">
                  <CardTitle className="text-xl group-hover:text-primary transition-colors">{item.name}</CardTitle>
                  <CardDescription className="line-clamp-2 mt-1 leading-relaxed">{item.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                <div className="flex flex-wrap gap-1.5">
                   {item.tags?.map((tag: string) => (
                      <Badge key={tag} variant="secondary" className="text-[9px] px-2 py-0 h-5 lowercase font-medium bg-muted/50 border-none">
                         #{tag}
                      </Badge>
                   ))}
                </div>

                {item.preset && (
                   <div className="bg-muted/30 rounded-xl p-3 space-y-2 border border-muted/50">
                      <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase">
                         <span>Environment Details</span>
                         <span className="text-primary">{item.preset.execution_language}</span>
                      </div>
                      <div className="flex items-center gap-3">
                         <div className="h-2 flex-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary/40 w-[80%]" />
                         </div>
                         <span className="text-[9px] font-mono text-muted-foreground">v1.2.4</span>
                      </div>
                   </div>
                )}
              </CardContent>
              <CardFooter className="pt-2 pb-6 px-6">
                <Button className="w-full gap-2 rounded-xl group-hover:bg-primary group-hover:text-primary-foreground transition-all" variant="secondary" asChild>
                   {/* @ts-ignore */}
                   <Link to="/jobs/create">
                      Use This Template <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                   </Link>
                </Button>
              </CardFooter>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
