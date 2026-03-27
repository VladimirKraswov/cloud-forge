import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { catalogApi } from '@/api/catalog';
import type { ContainerPreset, JobTemplate } from '@/api/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';

function SupportBadge({ value }: { value: 'supported' | 'future' }) {
  return (
    <span
      className={
        value === 'supported'
          ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700'
          : 'rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700'
      }
    >
      {value}
    </span>
  );
}

export function TemplatePickerDialog({
  onApplyTemplate,
  onApplyContainerPreset,
}: {
  onApplyTemplate: (template: JobTemplate) => void;
  onApplyContainerPreset: (preset: ContainerPreset) => void;
}) {
  const [open, setOpen] = useState(false);

  const templatesQuery = useQuery({
    queryKey: ['catalog', 'job-templates'],
    queryFn: catalogApi.listTemplates,
  });

  const containerPresetsQuery = useQuery({
    queryKey: ['catalog', 'container-presets'],
    queryFn: catalogApi.listContainerPresets,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Sparkles className="h-4 w-4" />
          Templates & presets
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Catalog</DialogTitle>
          <DialogDescription>
            Start from a backend template or reuse a container preset from the catalog.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="templates">
          <TabsList>
            <TabsTrigger value="templates">Job templates</TabsTrigger>
            <TabsTrigger value="containers">Container presets</TabsTrigger>
          </TabsList>

          <TabsContent value="templates">
            <div className="grid gap-4 md:grid-cols-2">
              {templatesQuery.isLoading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-40" />
                  ))
                : templatesQuery.data?.items.map((template) => (
                    <Card key={template.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          <SupportBadge value={template.support_level} />
                        </div>
                        <CardDescription>{template.description}</CardDescription>
                      </CardHeader>

                      <CardContent className="space-y-3">
                        <div className="flex flex-wrap gap-1.5">
                          {template.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>

                        <div className="text-xs text-muted-foreground">
                          {template.draft.execution_language} · {template.draft.containers.length}{' '}
                          container(s)
                        </div>

                        <div className="flex justify-end">
                          <Button
                            type="button"
                            onClick={() => {
                              onApplyTemplate(template);
                              setOpen(false);
                            }}
                          >
                            Apply
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
            </div>
          </TabsContent>

          <TabsContent value="containers">
            <div className="grid gap-4 md:grid-cols-2">
              {containerPresetsQuery.isLoading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-36" />
                  ))
                : containerPresetsQuery.data?.items.map((preset) => (
                    <Card key={preset.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <CardTitle className="text-base">{preset.name}</CardTitle>
                          <SupportBadge value={preset.support_level} />
                        </div>
                        <CardDescription>{preset.description}</CardDescription>
                      </CardHeader>

                      <CardContent className="space-y-3">
                        <div className="text-xs text-muted-foreground">
                          {preset.container.image}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {[preset.category, ...preset.recommended_for].map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>

                        <div className="flex justify-end">
                          <Button
                            type="button"
                            onClick={() => {
                              onApplyContainerPreset(preset);
                              setOpen(false);
                            }}
                          >
                            Add
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}