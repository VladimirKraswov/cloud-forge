import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate, useParams, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Info,
  Settings2,
  Code2,
  Package,
  ChevronRight,
  Sparkles,
  Zap,
} from 'lucide-react';
import { jobsApi, catalogApi } from '@/api';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/shared/utils';

const containerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  image: z.string().min(1, 'Image is required'),
  is_parent: z.boolean().optional(),
  env: z.record(z.string()).optional(),
  resources: z.object({
    cpu_limit: z.number().optional(),
    memory_limit: z.string().optional(),
    gpus: z.string().optional(),
    shm_size: z.string().optional(),
  }).optional(),
});

const jobSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().optional().nullable(),
  execution_language: z.enum(['python', 'javascript']),
  execution_code: z.string().min(1, 'Execution code is required'),
  entrypoint: z.string().optional().nullable(),
  environments: z.record(z.string()).default({}),
  containers: z.array(containerSchema).default([]),
});

type JobFormValues = z.infer<typeof jobSchema>;

export function JobEditorPage() {
  // @ts-ignore
  const params: any = useParams({ strict: false });
  const jobId = params?.jobId as string | undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'basics' | 'logic' | 'containers' | 'environments'>('basics');

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => (jobId ? jobsApi.get(jobId) : Promise.resolve(null)),
    enabled: !!jobId,
  });

  const { data: catalog } = useQuery({
    queryKey: ['catalog'],
    queryFn: catalogApi.list,
  });

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<JobFormValues>({
    resolver: zodResolver(jobSchema) as Resolver<JobFormValues>,
    defaultValues: {
      title: '',
      description: '',
      execution_language: 'python',
      execution_code: '# Write your code here\nprint("Hello World")',
      entrypoint: 'main.py',
      environments: {},
      containers: [],
    },
  });

  const { fields: containerFields, append: appendContainer, remove: removeContainer } = useFieldArray({
    control,
    name: 'containers',
  });

  useEffect(() => {
    if (job) {
      reset({
        title: job.title,
        description: job.description ?? '',
        execution_language: job.execution_language,
        execution_code: job.execution_code,
        entrypoint: job.entrypoint ?? '',
        environments: job.environments || {},
        containers: job.containers || [],
      });
    }
  }, [job, reset]);

  const saveMutation = useMutation({
    mutationFn: (values: JobFormValues) => {
      if (jobId) {
        return jobsApi.update(jobId, values);
      }
      return jobsApi.create({ ...values, id: crypto.randomUUID() });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success(jobId ? 'Job updated successfully' : 'Job created successfully');
      const id = jobId || data.id;
      // @ts-ignore
      navigate({ to: `/jobs/${id}` });
    },
    onError: (err: any) => {
      toast.error(`Failed to save job: ${err.response?.data?.message || err.message}`);
    }
  });

  const applyTemplate = (template: any) => {
     if (template.preset) {
        setValue('title', template.name, { shouldDirty: true });
        setValue('description', template.description, { shouldDirty: true });
        setValue('execution_language', template.preset.execution_language, { shouldDirty: true });
        setValue('execution_code', template.preset.execution_code, { shouldDirty: true });
        setValue('entrypoint', template.preset.entrypoint, { shouldDirty: true });
        setValue('containers', template.preset.containers || [], { shouldDirty: true });
        setValue('environments', template.preset.environments || {}, { shouldDirty: true });
        toast.info(`Template "${template.name}" applied!`);
     }
  };

  if (jobId && isLoading) {
    return <div className="h-[600px] flex items-center justify-center bg-muted/20 rounded-xl border border-dashed animate-pulse">
       <Settings2 className="h-10 w-10 text-muted-foreground animate-spin" />
    </div>;
  }

  const sections = [
     { id: 'basics', name: 'General Information', icon: Info },
     { id: 'logic', name: 'Execution Logic', icon: Code2 },
     { id: 'containers', name: 'Container Config', icon: Package },
     { id: 'environments', name: 'Environments', icon: Zap },
  ] as const;

  return (
    <div className="space-y-8 pb-20 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
           <Button variant="outline" size="icon" asChild className="rounded-full h-10 w-10">
              {/* @ts-ignore */}
              <Link to={jobId ? `/jobs/${jobId}` : '/jobs'}>
                 <ArrowLeft className="h-5 w-5" />
              </Link>
           </Button>
           <div>
              <h1 className="text-3xl font-bold tracking-tight">
                 {jobId ? 'Edit Job' : 'Create Job'}
              </h1>
              <p className="text-muted-foreground">Configure how your tasks should be executed.</p>
           </div>
        </div>
        <div className="flex items-center gap-3">
           {/* @ts-ignore */}
           <Button variant="ghost" onClick={() => navigate({ to: '/jobs' })}>Cancel</Button>
           <Button
              className="gap-2 shadow-lg"
              onClick={handleSubmit((data) => saveMutation.mutate(data))}
              disabled={isSubmitting || (!isDirty && !!jobId)}
           >
              <Save className="h-4 w-4" />
              {isSubmitting ? 'Saving...' : 'Save Job'}
           </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
         {/* Side Navigation */}
         <div className="lg:col-span-1 space-y-2">
            {sections.map(section => (
               <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveTab(section.id as any)}
                  className={cn(
                     "w-full flex items-center justify-between p-3 rounded-lg text-sm font-medium transition-all group",
                     activeTab === section.id
                        ? "bg-primary text-primary-foreground shadow-md translate-x-1"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
               >
                  <div className="flex items-center gap-3">
                     <section.icon className={cn("h-4 w-4", activeTab === section.id ? "text-white" : "text-muted-foreground group-hover:text-primary")} />
                     {section.name}
                  </div>
                  {activeTab === section.id && <ChevronRight className="h-4 w-4" />}
               </button>
            ))}

            <div className="mt-8 pt-8 border-t">
               <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quick Templates</span>
               </div>
               <div className="space-y-2">
                  {Array.isArray(catalog) && catalog.slice(0, 3).map((item: any) => (
                     <button
                        key={item.id}
                        type="button"
                        onClick={() => applyTemplate(item)}
                        className="w-full text-left p-2 rounded border border-dashed hover:border-primary hover:bg-primary/5 transition-colors text-xs"
                     >
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-muted-foreground truncate">{item.description}</p>
                     </button>
                  ))}
               </div>
            </div>
         </div>

         {/* Form Content */}
         <div className="lg:col-span-3">
            <Card className="border-none shadow-sm overflow-hidden">
               <CardHeader className="bg-accent/30 border-b">
                  <CardTitle className="flex items-center gap-2">
                     {sections.find(s => s.id === activeTab)?.name}
                  </CardTitle>
               </CardHeader>
               <CardContent className="p-8">
                  {activeTab === 'basics' && (
                     <div className="space-y-6">
                        <div className="space-y-2">
                           <label className="text-sm font-semibold">Title</label>
                           <Input {...register('title')} placeholder="Job title (e.g. Daily Data Cleanup)" className="bg-background" />
                           {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
                        </div>
                        <div className="space-y-2">
                           <label className="text-sm font-semibold">Description (optional)</label>
                           <textarea
                              {...register('description')}
                              placeholder="Brief description of what this job does..."
                              className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                           />
                        </div>
                        <div className="space-y-2">
                           <label className="text-sm font-semibold">Execution Language</label>
                           <div className="flex gap-4">
                              {(['python', 'javascript'] as const).map((lang) => (
                                 <label
                                    key={lang}
                                    className={cn(
                                       "flex-1 flex items-center justify-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all",
                                       watch('execution_language') === lang
                                          ? "border-primary bg-primary/5"
                                          : "border-muted hover:border-primary/50"
                                    )}
                                 >
                                    <input
                                       type="radio"
                                       value={lang}
                                       className="sr-only"
                                       {...register('execution_language')}
                                    />
                                    <span className="font-bold capitalize">{lang}</span>
                                    {watch('execution_language') === lang && <Zap className="h-4 w-4 text-primary fill-primary" />}
                                 </label>
                              ))}
                           </div>
                        </div>
                     </div>
                  )}

                  {activeTab === 'logic' && (
                     <div className="space-y-6">
                        <div className="space-y-2">
                           <div className="flex items-center justify-between">
                              <label className="text-sm font-semibold">Entrypoint File</label>
                              <Badge variant="outline" className="font-mono text-[10px]">{watch('execution_language')}</Badge>
                           </div>
                           <Input {...register('entrypoint')} placeholder={watch('execution_language') === 'python' ? 'main.py' : 'index.js'} className="bg-background" />
                        </div>
                        <div className="space-y-2">
                           <label className="text-sm font-semibold">Source Code</label>
                           <div className="relative group rounded-lg border overflow-hidden">
                              <textarea
                                 {...register('execution_code')}
                                 className="w-full min-h-[400px] font-mono text-xs p-4 bg-zinc-950 text-zinc-300 focus:outline-none focus:ring-0"
                                 spellCheck={false}
                              />
                              <div className="absolute top-2 right-2 flex gap-2">
                                 <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700">Code Editor</Badge>
                              </div>
                           </div>
                           {errors.execution_code && <p className="text-xs text-destructive">{errors.execution_code.message}</p>}
                        </div>
                     </div>
                  )}

                  {activeTab === 'containers' && (
                     <div className="space-y-6">
                        <div className="flex items-center justify-between">
                           <div>
                              <p className="text-sm font-semibold">Worker Containers</p>
                              <p className="text-xs text-muted-foreground">Define additional containers that should be orchestrated by the worker.</p>
                           </div>
                           <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() => appendContainer({ name: 'postgres', image: 'postgres:15-alpine', is_parent: false })}
                           >
                              <Plus className="h-4 w-4" /> Add Container
                           </Button>
                        </div>

                        <div className="space-y-4">
                           {containerFields.length === 0 ? (
                              <div className="py-12 flex flex-col items-center justify-center border border-dashed rounded-xl bg-muted/20 text-muted-foreground">
                                 <Package className="h-8 w-8 mb-2 opacity-50" />
                                 <p className="text-sm italic">No extra containers defined.</p>
                              </div>
                           ) : (
                              containerFields.map((field, index) => (
                                 <div key={field.id} className="p-4 rounded-xl border bg-accent/10 relative group">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                       <div className="space-y-1">
                                          <label className="text-[10px] font-bold uppercase text-muted-foreground">Container Name</label>
                                          <Input {...register(`containers.${index}.name`)} placeholder="e.g. db" className="bg-background" />
                                       </div>
                                       <div className="space-y-1">
                                          <label className="text-[10px] font-bold uppercase text-muted-foreground">Image</label>
                                          <Input {...register(`containers.${index}.image`)} placeholder="e.g. redis:7" className="bg-background" />
                                       </div>
                                    </div>
                                    <Button
                                       type="button"
                                       variant="ghost"
                                       size="icon"
                                       className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-background border shadow-sm text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                       onClick={() => removeContainer(index)}
                                    >
                                       <Trash2 className="h-3 w-3" />
                                    </Button>
                                 </div>
                              ))
                           )}
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-lg flex gap-3 items-start border border-blue-100 dark:border-blue-900/50">
                           <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                           <div className="text-xs text-blue-700 dark:text-blue-400">
                              <p className="font-bold mb-1">Architecture Note</p>
                              <p>The orchestrator does not currently manage multiple remote containers. These settings will be passed to the worker for its local docker orchestration during execution.</p>
                           </div>
                        </div>
                     </div>
                  )}

                  {activeTab === 'environments' && (
                     <div className="space-y-6">
                        <div>
                           <p className="text-sm font-semibold">Environment Variables</p>
                           <p className="text-xs text-muted-foreground">Key-value pairs available during task execution.</p>
                        </div>

                        <div className="bg-muted/30 p-4 rounded-xl space-y-4">
                            {/* Simple dynamic editor for records could be complex, using a simplified approach here */}
                            <div className="flex items-center justify-center py-10 text-muted-foreground italic text-sm">
                               <p>Environment variable UI editor is simplified in this view. Use the Logic/Containers tabs to define container-specific envs.</p>
                            </div>
                        </div>
                     </div>
                  )}
               </CardContent>
               <CardFooter className="bg-muted/10 border-t p-4 flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span>Last Modified: {job?.updated_at ? new Date(job.updated_at).toLocaleString() : 'N/A'}</span>
                  <span>ID: {jobId || 'NEW'}</span>
               </CardFooter>
            </Card>
         </div>
      </div>
    </div>
  );
}
