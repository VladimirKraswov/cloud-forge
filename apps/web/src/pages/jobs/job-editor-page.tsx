import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ArrowLeft, FileWarning } from 'lucide-react';
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
    bootstrapImageId?: string;
  };

  const jobId = params.jobId;
  const isEditMode = Boolean(jobId);
  const navigate = useNavigate();

  const jobQuery = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => jobsApi.get(jobId as string),
    enabled: isEditMode,
  });

  if (isEditMode && jobQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Edit job"
          title="Edit job"
          description="Update the selected bootstrap-image job configuration."
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isEditMode ? 'Edit job' : 'Create job'}
        title={isEditMode ? `Edit: ${jobQuery.data?.job.title ?? 'Job'}` : 'Create job'}
        description={
          isEditMode
            ? 'Update the selected job configuration.'
            : 'Create a new job by choosing a bootstrap image, configuring env vars, and building the workspace file tree.'
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
            key={`${jobId ?? 'create'}:${search.bootstrapImageId ?? 'none'}`}
            jobId={jobId}
            initialJobDetails={jobQuery.data ?? null}
            initialBootstrapImageId={search.bootstrapImageId ?? null}
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
