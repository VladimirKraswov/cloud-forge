import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Boxes, Cpu, Sparkles } from 'lucide-react';
import { catalogApi } from '@/api/catalog';
import type { BootstrapImage } from '@/api/types';
import { BootstrapBuilderDialog } from '@/features/catalog/bootstrap-builder-dialog';
import { EmptyState } from '@/shared/components/app/empty-state';
import { PageHeader } from '@/shared/components/app/page-header';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { formatRelative } from '@/shared/utils/format';

function StatusBadge({ status }: { status: BootstrapImage['status'] }) {
  const className =
    status === 'completed'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'failed'
        ? 'bg-red-50 text-red-700'
        : status === 'building' || status === 'pushing'
          ? 'bg-blue-50 text-blue-700'
          : 'bg-slate-100 text-slate-700';

  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${className}`}>{status}</span>;
}

export function CatalogPage() {
  const navigate = useNavigate();

  const bootstrapImagesQuery = useQuery({
    queryKey: ['bootstrap-images'],
    queryFn: catalogApi.listBootstrapImages,
  });

  const templatesQuery = useQuery({
    queryKey: ['catalog', 'job-templates'],
    queryFn: catalogApi.listTemplates,
  });

  const completedImages = useMemo(
    () =>
      (bootstrapImagesQuery.data?.items || []).filter(
        (image) => image.status === 'completed',
      ),
    [bootstrapImagesQuery.data?.items],
  );

  const buildingImages = useMemo(
    () =>
      (bootstrapImagesQuery.data?.items || []).filter(
        (image) => image.status === 'building' || image.status === 'pushing',
      ),
    [bootstrapImagesQuery.data?.items],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalog"
        title="Bootstrap images"
        description="Start by building or selecting a bootstrap image. Jobs now target a prepared bootstrap image instead of defining raw containers in the job form."
        actions={
          <BootstrapBuilderDialog
            onSuccess={() => {
              void bootstrapImagesQuery.refetch();
            }}
          />
        }
      />

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Ready to use</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Completed bootstrap images can be selected directly from the job builder.
          </p>
        </div>

        {completedImages.length ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {completedImages.map((image) => (
              <Card key={image.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-primary" />
                      {image.name}
                    </CardTitle>
                    <StatusBadge status={image.status} />
                  </div>
                  <CardDescription>{image.full_image_name}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-3 text-sm">
                  <div>Base image: {image.base_image}</div>
                  <div>Tag: {image.tag}</div>
                  <div>Environments: {image.environments.length}</div>
                  <div>Updated: {formatRelative(image.updated_at)}</div>

                  <div className="flex flex-wrap gap-1.5">
                    {image.environments.map((env) => (
                      <span
                        key={`${image.id}-${env.name}`}
                        className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                      >
                        #{env.name}
                      </span>
                    ))}
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={() =>
                        navigate({
                          to: '/jobs/create',
                          search: { bootstrapImageId: image.id },
                        })
                      }
                    >
                      Create job from image
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Cpu}
            title="No completed bootstrap images"
            description="Build your first bootstrap image to unlock the new job workflow."
          />
        )}
      </section>

      {buildingImages.length ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Builds in progress</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Refresh or reopen the builder dialog to watch live build logs.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {buildingImages.map((image) => (
              <Card key={image.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle>{image.name}</CardTitle>
                    <StatusBadge status={image.status} />
                  </div>
                  <CardDescription>{image.full_image_name}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-2 text-sm">
                  <div>Base image: {image.base_image}</div>
                  <div>Updated: {formatRelative(image.updated_at)}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Optional starter templates</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The new flow is bootstrap-image first, but these legacy catalog items can still serve as examples and inspiration.
          </p>
        </div>

        {templatesQuery.data?.items.length ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {templatesQuery.data.items.map((template) => (
              <Card key={template.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      {template.name}
                    </CardTitle>
                    <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {template.support_level}
                    </span>
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

                  <div className="text-muted-foreground">
                    These templates are not auto-applied by the new form anymore, but they remain useful as examples.
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Boxes}
            title="No templates"
            description="The backend did not return any job templates."
          />
        )}
      </section>
    </div>
  );
}
