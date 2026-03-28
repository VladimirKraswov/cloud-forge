import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from '@tanstack/react-router';
import { useI18n } from '@/shared/lib/i18n';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { catalogApi } from '@/api/catalog';
import { jobsApi } from '@/api/jobs';
import type {
  ExecutionLanguage,
  Job,
  JobDetailsResponse,
  JobFile,
} from '@/api/types';
import { BootstrapBuilderDialog } from '@/features/catalog/bootstrap-builder-dialog';
import { EnvironmentsFieldArray } from '@/features/jobs/job-form/environments-field-array';
import { WorkspaceExplorer } from '@/features/jobs/workspace/workspace-explorer';
import { WorkspaceEditor } from '@/features/jobs/workspace/workspace-editor';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useWorkspace } from '@/features/jobs/workspace/use-workspace';
import { EditableJobFile } from '@/features/jobs/job-form/job-files-editor';
import {
  jobFormSchema,
  type JobFormValues,
} from '@/features/jobs/job-form/job-form-schema';
import {
  mapFormValuesToPayload,
  mapJobToFormValues,
} from '@/features/jobs/job-form/job-form-mappers';
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
import { getApiErrorMessage } from '@/shared/lib/api-error';

function makeLocalId() {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

function getMainFilePath(language: ExecutionLanguage) {
  return language === 'javascript' ? 'src/main.js' : 'src/main.py';
}

function getMainFileMimeType(language: ExecutionLanguage) {
  return language === 'javascript' ? 'text/javascript' : 'text/x-python';
}

function getMainFileContent(language: ExecutionLanguage) {
  if (language === 'javascript') {
    return `console.log('Cloud Forge JavaScript job started');\n`;
  }

  return `print("Cloud Forge Python job started")\n`;
}

function getRunScriptContent(language: ExecutionLanguage) {
  if (language === 'javascript') {
    return `#!/usr/bin/env bash
set -euo pipefail

node src/main.js
`;
  }

  return `#!/usr/bin/env bash
set -euo pipefail

python src/main.py
`;
}

function makeMainDraft(language: ExecutionLanguage): any {
  const relativePath = getMainFilePath(language);

  return {
    local_id: makeLocalId(),
    relative_path: relativePath,
    filename: relativePath.split('/').pop() || relativePath,
    source_type: 'inline',
    mime_type: getMainFileMimeType(language),
    is_executable: false,
    inline_content: getMainFileContent(language),
    status: 'new',
    content_loaded: true,
    file: null,
  };
}

function makeRunScriptDraft(language: ExecutionLanguage): any {
  return {
    local_id: makeLocalId(),
    relative_path: 'scripts/run.sh',
    filename: 'run.sh',
    source_type: 'inline',
    mime_type: 'text/x-shellscript',
    is_executable: true,
    inline_content: getRunScriptContent(language),
    status: 'new',
    content_loaded: true,
    file: null,
  };
}

function makeDefaultScaffold(language: ExecutionLanguage): any[] {
  return [makeRunScriptDraft(language), makeMainDraft(language)];
}

function isDefaultScaffold(files: any[], language: ExecutionLanguage) {
  const visibleFiles = files
    .filter((file) => file.status !== 'deleted')
    .sort((left, right) => left.relative_path.localeCompare(right.relative_path));

  if (visibleFiles.length !== 2) return false;

  const [mainFile, runFile] = [...visibleFiles].sort((left, right) =>
    left.relative_path.localeCompare(right.relative_path),
  );

  const expectedMainPath = getMainFilePath(language);
  const expectedMainContent = getMainFileContent(language);
  const expectedRunContent = getRunScriptContent(language);

  const actualMain = visibleFiles.find((file) => file.relative_path === expectedMainPath);
  const actualRun = visibleFiles.find((file) => file.relative_path === 'scripts/run.sh');

  return Boolean(
    mainFile &&
      runFile &&
      actualMain &&
      actualRun &&
      actualMain.source_type === 'inline' &&
      actualMain.inline_content === expectedMainContent &&
      actualRun.source_type === 'inline' &&
      actualRun.inline_content === expectedRunContent &&
      actualRun.is_executable,
  );
}

function mapJobFileToEditable(file: JobFile): any {
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

function guessMimeType(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.py')) return 'text/x-python';
  if (lower.endsWith('.sh')) return 'text/x-shellscript';
  if (lower.endsWith('.js')) return 'text/javascript';
  if (lower.endsWith('.jsx')) return 'text/jsx';
  if (lower.endsWith('.ts')) return 'text/typescript';
  if (lower.endsWith('.tsx')) return 'text/tsx';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'text/yaml';
  if (lower.endsWith('.md')) return 'text/markdown';
  return 'application/octet-stream';
}

function toUploadDraft(file: File): any {
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
  const { t, lang } = useI18n();
  const isEditMode = Boolean(jobId);
  const [tab, setTab] = useState<'general' | 'files'>('general');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const previousLanguageRef = useRef<ExecutionLanguage>('python');

  const bootstrapImagesQuery = useQuery({
    queryKey: ['bootstrap-images'],
    queryFn: catalogApi.listBootstrapImages,
  });

  const initialValues = useMemo<JobFormValues>(
    () => mapJobToFormValues(initialJobDetails?.job ?? null, initialBootstrapImageId),
    [initialBootstrapImageId, initialJobDetails?.job],
  );

  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema) as any,
    defaultValues: initialValues,
  });

  const selectedExecutionLanguage = form.watch('execution_language');

  const languageLabels =
    lang === 'ru'
      ? {
          executionLanguage: 'Язык выполнения',
          python: 'Python',
          javascript: 'JavaScript',
        }
      : {
          executionLanguage: 'Execution language',
          python: 'Python',
          javascript: 'JavaScript',
        };

  useEffect(() => {
    form.reset(initialValues);
    setSubmitError(null);
    setTab('general');
    previousLanguageRef.current = initialValues.execution_language;
  }, [form, initialValues]);

  const workspace = useWorkspace(jobId, useMemo(() => {
    if (isEditMode) return initialJobDetails?.files || [];
    return makeDefaultScaffold(selectedExecutionLanguage);
  }, [isEditMode, initialJobDetails?.files, selectedExecutionLanguage]));

  useEffect(() => {
    if (isEditMode) {
      previousLanguageRef.current = selectedExecutionLanguage;
      return;
    }

    const previousLanguage = previousLanguageRef.current;
    if (previousLanguage === selectedExecutionLanguage) return;

    // Resetting scaffold on language change is complex with the new hook,
    // so we skip it for now or implement inside useWorkspace if needed.

    const selectedBootstrapImageId = form.getValues('bootstrap_image_id');
    if (selectedBootstrapImageId) {
      const images = bootstrapImagesQuery.data?.items ?? [];
      const stillValid = images.some(
        (image) =>
          image.id === selectedBootstrapImageId &&
          (image.execution_language ?? 'python') === selectedExecutionLanguage &&
          image.status === 'completed',
      );

      if (!stillValid) {
        form.setValue('bootstrap_image_id', '', {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    }

    previousLanguageRef.current = selectedExecutionLanguage;
  }, [
    bootstrapImagesQuery.data?.items,
    form,
    isEditMode,
    selectedExecutionLanguage,
  ]);

  const activeBootstrapImages =
    bootstrapImagesQuery.data?.items.filter(
      (image) =>
        image.status === 'completed' &&
        (image.execution_language ?? 'python') === selectedExecutionLanguage,
    ) || [];

  const syncFiles = async (savedJobId: string) => {
    if (isEditMode) return; // For existing jobs, workspace hook handles immediate saves

    // For new jobs, we need to upload the buffered files (scaffold + user edits)
    const filesToSync = workspace.bufferedFiles;
    for (const file of filesToSync) {
        if (file.source_type === 'directory') {
            await jobsApi.mkdir(savedJobId, file.relative_path);
            continue;
        }

        await jobsApi.saveFileContent(savedJobId, {
            relative_path: file.relative_path,
            content: file.inline_content || '',
            mime_type: file.mime_type,
            is_executable: file.is_executable,
        });
    }
  };

  const submit = form.handleSubmit(
    async (values: any) => {
      setSubmitError(null);

      try {
        const payload = mapFormValuesToPayload(values);
        const savedJob =
          isEditMode && jobId
            ? await jobsApi.update(jobId, payload)
            : await jobsApi.create(payload);

        await syncFiles(savedJob.id);

        toast.success(isEditMode ? t.errors.updated : t.errors.created);
        await onSaved(savedJob);
      } catch (error) {
        const message = getApiErrorMessage(error);
        setSubmitError(message);
        toast.error(message);
      }
    },
    () => {
      setSubmitError(t.forms.job.validation.fixErrors);
      toast.error(t.forms.job.validation.fixErrors);
      setTab('general');
    },
  );

  return (
    <DndProvider backend={HTML5Backend}>
    <form className="space-y-6" onSubmit={submit}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(value) => setTab(value as 'general' | 'files')}>
          <TabsList>
            <TabsTrigger value="general">{t.forms.job.general}</TabsTrigger>
            <TabsTrigger value="files">{t.forms.job.files}</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <BootstrapBuilderDialog
            onSuccess={() => {
              void bootstrapImagesQuery.refetch();
            }}
          />
          <Button variant="outline" asChild>
            <Link to="/catalog">{t.catalog.title}</Link>
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t.common.saving : t.common.save}
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
                <CardTitle>{t.forms.job.runtime}</CardTitle>
              </CardHeader>

              <CardContent className="grid gap-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="job-title">{t.forms.job.fields.title}</Label>
                    <Input id="job-title" {...form.register('title')} />
                    {form.formState.errors.title ? (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.title.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label>{languageLabels.executionLanguage}</Label>
                    <Select
                      value={selectedExecutionLanguage}
                      onValueChange={(value) =>
                        form.setValue('execution_language', value as ExecutionLanguage, {
                          shouldDirty: true,
                          shouldTouch: true,
                          shouldValidate: true,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="python">{languageLabels.python}</SelectItem>
                        <SelectItem value="javascript">{languageLabels.javascript}</SelectItem>
                      </SelectContent>
                    </Select>
                    {form.formState.errors.execution_language ? (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.execution_language.message}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t.forms.job.fields.bootstrapImage}</Label>
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
                        <SelectValue placeholder={t.forms.job.chooseBootstrap} />
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

                  <div className="space-y-2">
                    <Label htmlFor="job-entrypoint">{t.forms.job.fields.entrypoint}</Label>
                    <Input
                      id="job-entrypoint"
                      {...form.register('entrypoint')}
                      placeholder="scripts/run.sh"
                    />
                    {form.formState.errors.entrypoint ? (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.entrypoint.message}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="job-description">{t.forms.job.fields.description}</Label>
                  <Textarea id="job-description" {...form.register('description')} />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="job-entrypoint-args">
                      {t.forms.job.fields.entrypointArgs}
                    </Label>
                    <Input
                      id="job-entrypoint-args"
                      {...form.register('entrypoint_args_text')}
                      placeholder="--epochs 3 --lr 2e-4"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="job-working-dir">{t.forms.job.fields.workingDir}</Label>
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
                            {t.forms.job.bootstrapLoading}
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
                              {t.catalog.baseImageLabel}
                            </div>
                            <div className="mt-1 font-medium">{selected.base_image}</div>
                          </div>

                          <div>
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                              {languageLabels.executionLanguage}
                            </div>
                            <div className="mt-1 font-medium capitalize">
                              {selected.execution_language ?? 'python'}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                              {t.common.status}
                            </div>
                            <div className="mt-1 font-medium capitalize">
                              {selected.status}
                            </div>
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
                <CardTitle>{t.forms.job.envVars}</CardTitle>
              </CardHeader>

              <CardContent>
                <EnvironmentsFieldArray control={form.control} register={form.register} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t.forms.job.resources}</CardTitle>
              </CardHeader>

              <CardContent className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>{t.forms.job.fields.gpus}</Label>
                  <Input {...form.register('resources.gpus')} placeholder="all" />
                </div>

                <div className="space-y-2">
                  <Label>{t.forms.job.fields.shmSize}</Label>
                  <Input {...form.register('resources.shm_size')} placeholder="16g" />
                </div>

                <div className="space-y-2">
                  <Label>{t.forms.job.fields.memoryLimit}</Label>
                  <Input {...form.register('resources.memory_limit')} placeholder="64g" />
                </div>

                <div className="space-y-2">
                  <Label>{t.forms.job.fields.cpuLimit}</Label>
                  <Input {...form.register('resources.cpu_limit')} placeholder="8" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="files" className="h-[calc(100vh-280px)] min-h-[600px]">
            <div className="grid h-full grid-cols-[300px_1fr] rounded-xl border border-border overflow-hidden bg-background shadow-sm">
                <div className="border-r border-border h-full bg-muted/10">
                    <WorkspaceExplorer
                        tree={workspace.tree}
                        expandedPaths={workspace.expandedPaths}
                        onToggleExpand={workspace.toggleExpand}
                        onOpenFile={workspace.openFile}
                        onMkdir={workspace.mkdir}
                        onCreateFile={workspace.createFile}
                        onRename={(oldPath, newPath) => workspace.rename({ oldPath, newPath })}
                        onMove={(oldPath, newPath) => workspace.move({ oldPath, newPath })}
                        onDelete={workspace.deletePath}
                        onDownload={workspace.download}
                        onUpload={workspace.upload}
                        activePath={workspace.activeTabId}
                    />
                </div>
                <div className="h-full">
                    <WorkspaceEditor
                        tabs={workspace.openTabs}
                        activeTabId={workspace.activeTabId}
                        onSelectTab={workspace.setActiveTabId}
                        onCloseTab={workspace.closeTab}
                        onContentChange={workspace.updateTabContent}
                        onSaveTab={workspace.saveTab}
                    />
                </div>
            </div>
        </TabsContent>
      </Tabs>
    </form>
    </DndProvider>
  );
}