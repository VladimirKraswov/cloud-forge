import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ArrowLeft, FileWarning } from 'lucide-react';
import { catalogApi } from '@/api/catalog';
import { jobsApi } from '@/api/jobs';
import { JobBuilderForm } from '@/features/jobs/job-form/job-builder-form';
import { EmptyState } from '@/shared/components/app/empty-state';
import { PageHeader } from '@/shared/components/app/page-header';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';

export function JobEditorPage() {
  const params = useParams({ strict: false }) as { jobId?: string };
  const search = useSearch({ strict: false }) as {
    templateId?: string;
    containerPresetId?: string;
  };

  const jobId = params.jobId;
  const isEditMode = Boolean(jobId);
  const navigate = useNavigate();

  const templateId = !isEditMode ? search.templateId : undefined;
  const containerPresetId = !isEditMode ? search.containerPresetId : undefined;

  const jobQuery = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => jobsApi.get(jobId as string),
    enabled: isEditMode,
  });

  const templateQuery = useQuery({
    queryKey: ['catalog', 'job-template', templateId],
    queryFn: () => catalogApi.getTemplate(templateId as string),
    enabled: !isEditMode && Boolean(templateId),
  });

  const presetsQuery = useQuery({
    queryKey: ['catalog', 'container-presets'],
    queryFn: catalogApi.listContainerPresets,
    enabled: !isEditMode && Boolean(containerPresetId),
  });

  const initialContainerPreset = useMemo(() => {
    if (!containerPresetId || !presetsQuery.data?.items) return null;
    return (
      presetsQuery.data.items.find((preset) => preset.id === containerPresetId) ?? null
    );
  }, [containerPresetId, presetsQuery.data?.items]);

  const isCreateSeedLoading =
    !isEditMode &&
    ((Boolean(templateId) && templateQuery.isLoading) ||
      (Boolean(containerPresetId) && presetsQuery.isLoading));

  if (isEditMode && jobQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Edit job"
          title="Edit job"
          description="Update the selected job configuration."
          actions={
            <Button variant="outline" asChild>
              <Link to="/jobs/$jobId" params={{ jobId: jobId as string }}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
          }
        />

        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-12" />
              <Skeleton className="h-80" />
              <Skeleton className="h-32" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isCreateSeedLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Create job"
          title="Create job"
          description="Loading template or container preset from the catalog."
          actions={
            <Button variant="outline" asChild>
              <Link to="/catalog">
                <ArrowLeft className="h-4 w-4" />
                Back to catalog
              </Link>
            </Button>
          }
        />

        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-12" />
              <Skeleton className="h-80" />
              <Skeleton className="h-32" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isEditMode && !jobQuery.data) {
    return (
      <EmptyState
        icon={FileWarning}
        title="Job not found"
        description="The job could not be loaded for editing."
        action={
          <Button asChild>
            <Link to="/jobs">Back to jobs</Link>
          </Button>
        }
      />
    );
  }

  if (!isEditMode && templateId && templateQuery.isError) {
    return (
      <EmptyState
        icon={FileWarning}
        title="Template not found"
        description="The selected catalog template could not be loaded."
        action={
          <Button asChild>
            <Link to="/catalog">Back to catalog</Link>
          </Button>
        }
      />
    );
  }

  if (!isEditMode && containerPresetId && !initialContainerPreset) {
    return (
      <EmptyState
        icon={FileWarning}
        title="Container preset not found"
        description="The selected container preset could not be loaded."
        action={
          <Button asChild>
            <Link to="/catalog">Back to catalog</Link>
          </Button>
        }
      />
    );
  }

  const createDescription = templateId
    ? 'Create a new job from the selected catalog template.'
    : containerPresetId
      ? 'Create a new job with the selected container preset already added.'
      : 'Create a new job with code, containers, environment, and attached files.';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isEditMode ? 'Edit job' : 'Create job'}
        title={isEditMode ? `Edit: ${jobQuery.data?.title ?? 'Job'}` : 'Create job'}
        description={
          isEditMode
            ? 'Update the selected job configuration.'
            : createDescription
        }
        actions={
          <Button variant="outline" asChild>
            <Link
              to={isEditMode ? '/jobs/$jobId' : '/jobs'}
              params={isEditMode ? { jobId: jobId as string } : undefined}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-6">
          <JobBuilderForm
            key={`${jobId ?? 'create'}:${templateId ?? 'none'}:${containerPresetId ?? 'none'}`}
            jobId={jobId}
            initialJob={jobQuery.data ?? null}
            initialTemplate={!isEditMode ? templateQuery.data ?? null : null}
            initialContainerPreset={!isEditMode ? initialContainerPreset : null}
            onSaved={(job) =>
              navigate({
                to: '/jobs/$jobId',
                params: { jobId: job.id },
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}