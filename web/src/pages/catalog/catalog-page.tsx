import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Boxes, Sparkles } from 'lucide-react';
import { catalogApi } from '@/api/catalog';
import { EmptyState } from '@/shared/components/app/empty-state';
import { PageHeader } from '@/shared/components/app/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';

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

export function CatalogPage() {
  const navigate = useNavigate();

  const templatesQuery = useQuery({
    queryKey: ['catalog', 'job-templates'],
    queryFn: catalogApi.listTemplates,
  });

  const presetsQuery = useQuery({
    queryKey: ['catalog', 'container-presets'],
    queryFn: catalogApi.listContainerPresets,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalog"
        title="Templates & presets"
        description="Click any template or preset to open the job editor with that configuration pre-filled."
      />

      <div className="space-y-8">
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Job templates</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Start a new job from a ready-to-run backend template.
            </p>
          </div>

          {templatesQuery.data?.items.length ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {templatesQuery.data.items.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() =>
                    navigate({
                      to: '/jobs/create',
                      search: { templateId: template.id },
                    })
                  }
                  className="text-left"
                >
                  <Card className="h-full cursor-pointer transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-soft)]">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          {template.name}
                        </CardTitle>
                        <SupportBadge value={template.support_level} />
                      </div>
                      <CardDescription>{template.description}</CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-3 text-sm">
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

                      <div>Language: {template.draft.execution_language}</div>
                      <div>Entrypoint: {template.draft.entrypoint || '—'}</div>
                      <div>Containers: {template.draft.containers.length}</div>

                      <div className="pt-2 text-sm font-medium text-primary">
                        Open in job editor →
                      </div>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Sparkles}
              title="No templates"
              description="The backend did not return any job templates."
            />
          )}
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Container presets</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Open the job editor and add a preset container automatically.
            </p>
          </div>

          {presetsQuery.data?.items.length ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {presetsQuery.data.items.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    navigate({
                      to: '/jobs/create',
                      search: { containerPresetId: preset.id },
                    })
                  }
                  className="text-left"
                >
                  <Card className="h-full cursor-pointer transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-soft)]">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="flex items-center gap-2">
                          <Boxes className="h-4 w-4 text-primary" />
                          {preset.name}
                        </CardTitle>
                        <SupportBadge value={preset.support_level} />
                      </div>
                      <CardDescription>{preset.description}</CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-3 text-sm">
                      <div>Container name: {preset.container.name}</div>
                      <div>Image: {preset.container.image}</div>
                      <div>CPU: {preset.container.resources?.cpu_limit ?? '—'}</div>
                      <div>Memory: {preset.container.resources?.memory_limit ?? '—'}</div>

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

                      <div className="pt-2 text-sm font-medium text-primary">
                        Open in job editor →
                      </div>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Boxes}
              title="No container presets"
              description="The backend did not return any container presets."
            />
          )}
        </section>
      </div>
    </div>
  );
}