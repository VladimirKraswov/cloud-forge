import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useI18n } from '@/shared/lib/i18n';
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
  const { t } = useI18n();
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
        eyebrow={t.navigation.catalog}
        title={t.catalog.title}
        description={t.catalog.description}
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
          <h2 className="text-xl font-semibold tracking-tight">{t.catalog.readyToUse}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.catalog.readyToUseDesc}</p>
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
                  <div>
                    {t.catalog.baseImageLabel}: {image.base_image}
                  </div>
                  <div>
                    {t.catalog.tag}: {image.tag}
                  </div>
                  <div>
                    {t.navigation.catalog}: {image.environments.length}
                  </div>
                  <div>
                    {t.common.updated}: {formatRelative(image.updated_at)}
                  </div>

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
                      {t.catalog.createJobFromImage}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Cpu}
            title={t.catalog.noCompletedImages}
            description={t.catalog.noCompletedImagesDesc}
          />
        )}
      </section>

      {buildingImages.length ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{t.catalog.buildsInProgress}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.catalog.buildsInProgressDesc}</p>
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
                  <div>
                    {t.catalog.baseImageLabel}: {image.base_image}
                  </div>
                  <div>
                    {t.common.updated}: {formatRelative(image.updated_at)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t.catalog.starterTemplates}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.catalog.starterTemplatesDesc}</p>
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

                  <div className="text-muted-foreground">{t.catalog.starterTemplatesNote}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Boxes}
            title={t.catalog.noTemplates}
            description={t.catalog.noTemplatesDesc}
          />
        )}
      </section>
    </div>
  );
}
