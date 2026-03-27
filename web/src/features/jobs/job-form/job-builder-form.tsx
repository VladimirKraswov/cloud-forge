import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { catalogApi } from '@/api/catalog';
import { jobsApi } from '@/api/jobs';
import type { Job, JobDetailsResponse, JobFile } from '@/api/types';
import { BootstrapBuilderDialog } from '@/features/catalog/bootstrap-builder-dialog';
import { EnvironmentsFieldArray } from '@/features/jobs/job-form/environments-field-array';
import {
  EditableJobFile,
  JobFilesEditor,
  isTextEditableFile,
} from '@/features/jobs/job-form/job-files-editor';
import {
  jobFormSchema,
  type JobFormValues,
} from '@/features/jobs/job-form/job-form-schema';
import {
  mapFormValuesToPayload,
  mapJobToFormValues,
} from '@/features/jobs/job-form/job-form-mappers';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Textarea } from '@/shared/components/ui/textarea';

function makeLocalId() {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

function mapJobFileToEditable(file: JobFile): EditableJobFile {
  return {
    local_id: makeLocalId(),
    existing_id: file.id,
    original_relative_path: file.relative_path,
    relative_path: file.relative_path,
    filename: file.filename,
    source_type: file.source_type,
    mime_type: file.mime_type,
    is_executable: file.is_executable,
    inline_content: file.inline_content || '',
    status: 'existing',
    content_loaded: file.source_type === 'inline',
    file: null,
  };
}

function makeInlineDraft(): EditableJobFile {
  return {
    local_id: makeLocalId(),
    relative_path: 'src/main.py',
    filename: 'main.py',
    source_type: 'inline',
    mime_type: 'text/x-python',
    is_executable: false,
    inline_content: '',
    status: 'new',
    content_loaded: true,
    file: null,
  };
}

function guessMimeType(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.py')) return 'text/x-python';
  if (lower.endsWith('.sh')) return 'text/x-shellscript';
  if (lower.endsWith('.js')) return 'text/javascript';
  if (lower.endsWith('.ts')) return 'text/typescript';
  if (lower.endsWith('.tsx')) return 'text/tsx';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'text/yaml';
  if (lower.endsWith('.md')) return 'text/markdown';
  return 'application/octet-stream';
}

function toUploadDraft(file: File): EditableJobFile {
  const relativePath =
    (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

  return {
    local_id: makeLocalId(),
    relative_path: relativePath,
    filename: file.name,
    source_type: 'upload',
    mime_type: file.type || guessMimeType(file.name),
    is_executable: file.name.endsWith('.sh'),
    inline_content: '',
    status: 'new',
    content_loaded: false,
    file,
  };
}

export function JobBuilderForm({
  jobId,
  initialJobDetails,
  initialBootstrapImageId,
  onSaved,
}: {
  jobId?: string;
  initialJobDetails?: JobDetailsResponse | null;
  initialBootstrapImageId?: string | null;
  onSaved: (job: Job) => Promise<void> | void;
}) {
  const isEditMode = Boolean(jobId);
  const [tab, setTab] = useState<'general' | 'files'>('general');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [files, setFiles] = useState<EditableJobFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [loadingContentFileId, setLoadingContentFileId] = useState<string | null>(null);

  const bootstrapImagesQuery = useQuery({
    queryKey: ['bootstrap-images'],
    queryFn: catalogApi.listBootstrapImages,
  });

  const initialValues = useMemo(
    () => mapJobToFormValues(initialJobDetails?.job ?? null, initialBootstrapImageId),
    [initialBootstrapImageId, initialJobDetails?.job],
  );

  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: initialValues,
  });

  useEffect(() => {
    form.reset(initialValues);
    const mappedFiles = (initialJobDetails?.files ?? []).map(mapJobFileToEditable);
    setFiles(mappedFiles);
    setSelectedFileId(mappedFiles[0]?.local_id || null);
    setSubmitError(null);
    setTab('general');
  }, [form, initialJobDetails?.files, initialValues]);

  useEffect(() => {
    const firstFile = files.find((file) => file.status !== 'deleted');
    if (!selectedFileId && firstFile) {
      setSelectedFileId(firstFile.local_id);
    }
  }, [files, selectedFileId]);

  const filesByLocalId = useMemo(() => {
    return new Map(files.map((file) => [file.local_id, file]));
  }, [files]);

  const selectedFile = selectedFileId ? filesByLocalId.get(selectedFileId) || null : null;

  const activeBootstrapImages =
    bootstrapImagesQuery.data?.items.filter((image) => image.status === 'completed') || [];

  const updateFile = (localId: string, patch: Partial<EditableJobFile>) => {
    setFiles((current) =>
      current.map((file) => (file.local_id === localId ? { ...file, ...patch } : file)),
    );
  };

  const addInlineFile = () => {
    const next = makeInlineDraft();
    setFiles((current) => [...current, next]);
    setSelectedFileId(next.local_id);
    setTab('files');
  };

  const addUploadFiles = (pickedFiles: FileList | null) => {
    if (!pickedFiles?.length) return;

    const nextFiles = Array.from(pickedFiles).map(toUploadDraft);
    setFiles((current) => [...current, ...nextFiles]);
    setSelectedFileId((previous) => previous || nextFiles[0]?.local_id || null);
    setTab('files');
  };

  const deleteFile = (localId: string) => {
    setFiles((current) => {
      const target = current.find((file) => file.local_id === localId);
      if (!target) return current;

      const next =
        target.status === 'existing'
          ? current.map((file) =>
              file.local_id === localId ? { ...file, status: 'deleted' as const } : file,
            )
          : current.filter((file) => file.local_id !== localId);

      const visible = next.filter((file) => file.status !== 'deleted');
      setSelectedFileId(visible[0]?.local_id || null);
      return next;
    });
  };

  const loadSelectedFileContent = async (localId: string) => {
    const target = filesByLocalId.get(localId);
    if (!target || target.content_loaded || !isTextEditableFile(target)) return;

    setLoadingContentFileId(localId);

    try {
      if (target.file) {
        const text = await target.file.text();
        updateFile(localId, {
          inline_content: text,
          content_loaded: true,
        });
      } else if (jobId) {
        const text = await jobsApi.getFileContent(jobId, target.relative_path);
        updateFile(localId, {
          inline_content: text,
          content_loaded: true,
        });
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to load file content');
    } finally {
      setLoadingContentFileId(null);
    }
  };

  const selectFile = (localId: string) => {
    setSelectedFileId(localId);
    void loadSelectedFileContent(localId);
  };

  const syncFiles = async (savedJobId: string) => {
    const visibleFiles = files.filter((file) => file.status !== 'deleted');
    const deletePaths = new Set<string>();

    for (const file of files) {
      if (file.status === 'deleted' && file.original_relative_path) {
        deletePaths.add(file.original_relative_path);
      }

      if (
        file.status !== 'deleted' &&
        file.original_relative_path &&
        file.original_relative_path !== file.relative_path
      ) {
        deletePaths.add(file.original_relative_path);
      }
    }

    for (const relativePath of deletePaths) {
      await jobsApi.deleteFile(savedJobId, relativePath);
    }

    for (const file of visibleFiles) {
      const renamedExistingUploadWithoutContent =
        file.status === 'existing' &&
        file.original_relative_path !== file.relative_path &&
        file.source_type === 'upload' &&
        !file.file &&
        !file.content_loaded;

      if (renamedExistingUploadWithoutContent) {
        throw new Error(
          `File "${file.original_relative_path}" was renamed but its content is not available in the browser. Re-upload it or open it as text and save it inline.`,
        );
      }

      if (file.source_type === 'inline') {
        await jobsApi.saveFileContent(savedJobId, {
          relative_path: file.relative_path,
          content: file.inline_content,
          mime_type: file.mime_type,
          is_executable: file.is_executable,
        });
        continue;
      }

      if (file.source_type === 'upload' && file.file) {
        await jobsApi.uploadFile(
          savedJobId,
          file.file,
          file.relative_path,
          file.is_executable,
        );
      }
    }
  };

  const submit = form.handleSubmit(
    async (values) => {
      setSubmitError(null);

      try {
        const payload = mapFormValuesToPayload(values);
        const savedJob =
          isEditMode && jobId
            ? await jobsApi.update(jobId, payload)
            : await jobsApi.create(payload);

        await syncFiles(savedJob.id);

        toast.success(isEditMode ? 'Job updated' : 'Job created');
        await onSaved(savedJob);
      } catch (error) {
        const message = getApiErrorMessage(error);
        setSubmitError(message);
        toast.error(message);
      }
    },
    () => {
      setSubmitError('Please fix validation errors before saving');
      toast.error('Please fix validation errors before saving');
      setTab('general');
    },
  );

  return (
    <form className="space-y-6" onSubmit={submit}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(value) => setTab(value as 'general' | 'files')}>
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="files">Workspace files</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <BootstrapBuilderDialog
            onSuccess={() => {
              void bootstrapImagesQuery.refetch();
            }}
          />
          <Button variant="outline" asChild>
            <Link to="/catalog">Open catalog</Link>
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Saving…' : 'Save job'}
          </Button>
        </div>
      </div>

      {submitError ? (
        <div className="whitespace-pre-line rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {submitError}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={(value) => setTab(value as 'general' | 'files')}>
        <TabsContent value="general">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Job runtime</CardTitle>
              </CardHeader>

              <CardContent className="grid gap-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="job-title">Title</Label>
                    <Input id="job-title" {...form.register('title')} />
                    {form.formState.errors.title ? (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.title.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label>Bootstrap image</Label>
                    <Select
                      value={form.watch('bootstrap_image_id')}
                      onValueChange={(value) =>
                        form.setValue('bootstrap_image_id', value, {
                          shouldDirty: true,
                          shouldTouch: true,
                          shouldValidate: true,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose bootstrap image" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeBootstrapImages.map((image) => (
                          <SelectItem key={image.id} value={image.id}>
                            {image.name} · {image.tag}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.formState.errors.bootstrap_image_id ? (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.bootstrap_image_id.message}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="job-description">Description</Label>
                  <Textarea id="job-description" {...form.register('description')} />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="job-entrypoint">Entrypoint</Label>
                    <Input
                      id="job-entrypoint"
                      {...form.register('entrypoint')}
                      placeholder="scripts/train.sh"
                    />
                    {form.formState.errors.entrypoint ? (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.entrypoint.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="job-entrypoint-args">Entrypoint args</Label>
                    <Input
                      id="job-entrypoint-args"
                      {...form.register('entrypoint_args_text')}
                      placeholder="--epochs 3 --lr 2e-4"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="job-working-dir">Working directory</Label>
                    <Input
                      id="job-working-dir"
                      {...form.register('working_dir')}
                      placeholder="/workspace"
                    />
                  </div>
                </div>

                {form.watch('bootstrap_image_id') ? (
                  <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm">
                    {(() => {
                      const selected = activeBootstrapImages.find(
                        (image) => image.id === form.watch('bootstrap_image_id'),
                      );

                      if (!selected) {
                        return (
                          <span className="text-muted-foreground">
                            Selected bootstrap image details are not loaded yet.
                          </span>
                        );
                      }

                      return (
                        <div className="grid gap-2 md:grid-cols-2">
                          <div>
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                              Docker image
                            </div>
                            <div className="mt-1 font-medium">{selected.full_image_name}</div>
                          </div>

                          <div>
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                              Base image
                            </div>
                            <div className="mt-1 font-medium">{selected.base_image}</div>
                          </div>

                          <div>
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                              Environments
                            </div>
                            <div className="mt-1 font-medium">{selected.environments.length}</div>
                          </div>

                          <div>
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                              Status
                            </div>
                            <div className="mt-1 font-medium capitalize">{selected.status}</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Environment variables</CardTitle>
              </CardHeader>

              <CardContent>
                <EnvironmentsFieldArray control={form.control} register={form.register} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Runtime resource hints</CardTitle>
              </CardHeader>

              <CardContent className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>GPUs</Label>
                  <Input {...form.register('resources.gpus')} placeholder="all" />
                </div>

                <div className="space-y-2">
                  <Label>Shared memory</Label>
                  <Input {...form.register('resources.shm_size')} placeholder="16g" />
                </div>

                <div className="space-y-2">
                  <Label>Memory limit</Label>
                  <Input {...form.register('resources.memory_limit')} placeholder="64g" />
                </div>

                <div className="space-y-2">
                  <Label>CPU limit</Label>
                  <Input {...form.register('resources.cpu_limit')} placeholder="8" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="files">
          <JobFilesEditor
            files={files}
            selectedFileId={selectedFile?.local_id || null}
            loadingContent={loadingContentFileId === selectedFile?.local_id}
            onSelectFile={selectFile}
            onAddInlineFile={addInlineFile}
            onPickUploadFiles={addUploadFiles}
            onUpdateFile={updateFile}
            onDeleteFile={deleteFile}
          />
        </TabsContent>
      </Tabs>
    </form>
  );
}
