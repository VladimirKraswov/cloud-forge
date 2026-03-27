import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { ContainerPreset, Job, JobTemplate } from '@/api/types';
import { artifactsApi } from '@/api/artifacts';
import { jobsApi } from '@/api/jobs';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Textarea } from '@/shared/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { AttachedFilesField } from '@/features/jobs/job-form/attached-files-field';
import { ContainersFieldArray } from '@/features/jobs/job-form/containers-field-array';
import { EnvironmentsFieldArray } from '@/features/jobs/job-form/environments-field-array';
import {
  jobFormSchema,
  type JobFormValues,
} from '@/features/jobs/job-form/job-form-schema';
import {
  mapFormValuesToPayload,
  mapJobToFormValues,
} from '@/features/jobs/job-form/job-form-mappers';
import {
  normalizeFormContainers as globalNormalizeFormContainers,
  normalizePayloadContainers as globalNormalizePayloadContainers,
} from '@/features/jobs/job-form/job-form-helpers';
import { TemplatePickerDialog } from '@/features/jobs/job-form/template-picker-dialog';
import { CodeBlock } from '@/shared/components/app/code-block';
import { getApiErrorMessage } from '@/shared/lib/api-error';

type FormContainer = JobFormValues['containers'][number];


export function JobBuilderForm({
  jobId,
  initialJob,
  initialTemplate,
  initialContainerPreset,
  onSaved,
}: {
  jobId?: string;
  initialJob?: Job | null;
  initialTemplate?: JobTemplate | null;
  initialContainerPreset?: ContainerPreset | null;
  onSaved: (job: Job) => Promise<void> | void;
}) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [tab, setTab] = useState('general');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isEditMode = Boolean(jobId);
  const appliedTemplateIdRef = useRef<string | null>(null);
  const appliedContainerPresetIdRef = useRef<string | null>(null);

  const initialValues = useMemo(() => mapJobToFormValues(initialJob), [initialJob]);

  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: initialValues,
  });

  useEffect(() => {
    if (isEditMode && !initialJob) {
      return;
    }

    form.reset(initialValues);
    setPendingFiles([]);
    setSubmitError(null);
    setTab('general');
    appliedTemplateIdRef.current = null;
    appliedContainerPresetIdRef.current = null;
  }, [form, initialValues, initialJob, isEditMode]);

  const attachmentsFieldArray = useFieldArray({
    control: form.control,
    name: 'attached_files',
  });

  const existingAttachments = form.watch('attached_files');
  const codePreview = form.watch('execution_code');
  const language = form.watch('execution_language');

  const addPendingFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return;

    const nextFiles = Array.from(fileList).filter(
      (file) => !pendingFiles.some((current) => current.name === file.name),
    );

    setPendingFiles((previous) => [...previous, ...nextFiles]);
  };

  const applyTemplateToForm = useCallback(
    (template: JobTemplate, notify = true) => {
      const draft = template.draft;
      const nextLanguage = draft.execution_language ?? 'python';

      const mappedContainers: FormContainer[] = (draft.containers || []).map((container) => ({
        name: container.name ?? '',
        image: container.image ?? '',
        is_parent: Boolean(container.is_parent),
        env: Object.entries(container.env || {}).map(([key, value]) => ({
          key,
          value: String(value ?? ''),
        })),
        resources: {
          cpu_limit:
            container.resources?.cpu_limit !== undefined
              ? String(container.resources.cpu_limit)
              : '',
          memory_limit: container.resources?.memory_limit ?? '',
          gpus: container.resources?.gpus ?? '',
          shm_size: container.resources?.shm_size ?? '',
        },
      }));

      form.reset({
        ...form.getValues(),
        title: draft.title || template.name || form.getValues('title'),
        description: draft.description || template.description || '',
        execution_language: nextLanguage,
        execution_code: draft.execution_code ?? '',
        entrypoint:
          draft.entrypoint || (nextLanguage === 'javascript' ? 'main.js' : 'main.py'),
        environments: Object.entries(draft.environments || {}).map(([key, value]) => ({
          key,
          value: String(value ?? ''),
        })),
        containers: globalNormalizeFormContainers(mappedContainers, nextLanguage),
        attached_files: form.getValues('attached_files'),
      });

      form.clearErrors();
      setSubmitError(null);

      if (notify) {
        toast.success(`Applied template: ${template.name}`);
      }
    },
    [form],
  );

  const applyContainerPresetToForm = useCallback(
    (preset: ContainerPreset, notify = true) => {
      const currentContainers = form.getValues('containers');

      const nextContainers = globalNormalizeFormContainers(
        [
          ...currentContainers,
          {
            name: preset.container.name ?? preset.name,
            image: preset.container.image ?? '',
            is_parent: Boolean(preset.container.is_parent),
            env: Object.entries(preset.container.env || {}).map(([key, value]) => ({
              key,
              value: String(value ?? ''),
            })),
            resources: {
              cpu_limit: preset.container.resources?.cpu_limit?.toString() || '',
              memory_limit: preset.container.resources?.memory_limit || '',
              gpus: preset.container.resources?.gpus || '',
              shm_size: preset.container.resources?.shm_size || '',
            },
          },
        ],
        form.getValues('execution_language'),
      );

      form.setValue('containers', nextContainers, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });

      setSubmitError(null);

      if (notify) {
        toast.success(`Added container preset: ${preset.name}`);
      }
    },
    [form],
  );

  useEffect(() => {
    if (isEditMode) return;

    if (initialTemplate && appliedTemplateIdRef.current !== initialTemplate.id) {
      applyTemplateToForm(initialTemplate, false);
      appliedTemplateIdRef.current = initialTemplate.id;
      appliedContainerPresetIdRef.current = null;
      return;
    }

    if (
      !initialTemplate &&
      initialContainerPreset &&
      appliedContainerPresetIdRef.current !== initialContainerPreset.id
    ) {
      applyContainerPresetToForm(initialContainerPreset, false);
      appliedContainerPresetIdRef.current = initialContainerPreset.id;
    }
  }, [
    applyContainerPresetToForm,
    applyTemplateToForm,
    initialContainerPreset,
    initialTemplate,
    isEditMode,
  ]);

  const submit = form.handleSubmit(
    async (values) => {
      setSubmitError(null);

      try {
        if (isEditMode && !jobId) {
          throw new Error('Cannot update job: missing job id');
        }

        const payload = mapFormValuesToPayload(values);
        const normalizedPayload = {
          ...payload,
          containers: globalNormalizePayloadContainers(
            values.containers,
            payload.execution_language,
          ),
        };

        const savedJob =
          isEditMode && jobId
            ? await jobsApi.update(jobId, normalizedPayload)
            : await jobsApi.create(normalizedPayload);

        if (pendingFiles.length) {
          const uploadedFiles = [];

          for (const file of pendingFiles) {
            const uploaded = await artifactsApi.uploadJobFile(savedJob.id, file);
            uploadedFiles.push(uploaded);
          }

          if (uploadedFiles.length) {
            const finalFiles = [...values.attached_files, ...uploadedFiles];
            const updatedJob = await jobsApi.update(savedJob.id, { attached_files: finalFiles });
            setPendingFiles([]);
            toast.success(isEditMode ? 'Job updated' : 'Job created');
            await onSaved(updatedJob);
            return;
          }
        }

        savedJob.attached_files = values.attached_files;
        setPendingFiles([]);
        toast.success(isEditMode ? 'Job updated' : 'Job created');
        await onSaved(savedJob);
      } catch (error) {
        const message = getApiErrorMessage(error);
        setSubmitError(message);
        toast.error(message);
        console.error('Save job failed:', error);
      }
    },
    (errors) => {
      setSubmitError('Please fix validation errors before saving');

      if (errors.title || errors.description || errors.entrypoint || errors.execution_language) {
        setTab('general');
      } else if (errors.execution_code) {
        setTab('code');
      } else if (errors.containers) {
        setTab('containers');
      } else if (errors.environments || errors.attached_files) {
        setTab('attachments');
      }

      toast.error('Please fix validation errors before saving');
    },
  );

  const tabs = useMemo(
    () => [
      { id: 'general', label: 'General' },
      { id: 'code', label: 'Execution' },
      { id: 'containers', label: 'Containers' },
      { id: 'attachments', label: 'Files & env' },
    ],
    [],
  );

  return (
    <form className="space-y-6" onSubmit={submit}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {tabs.map((item) => (
              <TabsTrigger key={item.id} value={item.id}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <TemplatePickerDialog
            onApplyTemplate={(template) => applyTemplateToForm(template, true)}
            onApplyContainerPreset={(preset) => applyContainerPresetToForm(preset, true)}
          />
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Saving...' : 'Save job'}
          </Button>
        </div>
      </div>

      {submitError ? (
        <div className="whitespace-pre-line rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {submitError}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" {...form.register('title')} />
                  {form.formState.errors.title ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.title.message}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="entrypoint">Entrypoint filename</Label>
                  <Input
                    id="entrypoint"
                    {...form.register('entrypoint')}
                    placeholder={language === 'javascript' ? 'main.js' : 'main.py'}
                  />
                  {form.formState.errors.entrypoint ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.entrypoint.message}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" {...form.register('description')} />
                {form.formState.errors.description ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.description.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>Execution language</Label>
                <Select
                  value={form.watch('execution_language')}
                  onValueChange={(value) =>
                    form.setValue(
                      'execution_language',
                      value as JobFormValues['execution_language'],
                      {
                        shouldDirty: true,
                        shouldTouch: true,
                        shouldValidate: true,
                      },
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="python">Python</SelectItem>
                    <SelectItem value="javascript">JavaScript</SelectItem>
                  </SelectContent>
                </Select>
                {form.formState.errors.execution_language ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.execution_language.message}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="code">
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle>Execution code</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Textarea
                  className="min-h-[520px] font-mono text-sm"
                  spellCheck={false}
                  {...form.register('execution_code')}
                />
                {form.formState.errors.execution_code ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.execution_code.message}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <CodeBlock code={codePreview || '// Start typing…'} language={language} />
          </div>
        </TabsContent>

        <TabsContent value="containers">
          <div className="space-y-3">
            <ContainersFieldArray
              control={form.control}
              register={form.register}
              setValue={form.setValue}
            />
            {form.formState.errors.containers ? (
              <p className="text-xs text-destructive">
                {Array.isArray(form.formState.errors.containers)
                  ? 'Please fix container configuration'
                  : form.formState.errors.containers.message}
              </p>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="attachments">
          <div className="space-y-6">
            <AttachedFilesField
              existingFiles={existingAttachments}
              pendingFiles={pendingFiles}
              onPickFiles={addPendingFiles}
              onRemoveExisting={(fileId) => {
                const index = existingAttachments.findIndex((file) => file.id === fileId);
                if (index >= 0) attachmentsFieldArray.remove(index);
              }}
              onRemovePending={(fileName) =>
                setPendingFiles((current) =>
                  current.filter((file) => file.name !== fileName),
                )
              }
            />

            <Card>
              <CardHeader>
                <CardTitle>Job environment</CardTitle>
              </CardHeader>
              <CardContent>
                <EnvironmentsFieldArray
                  control={form.control}
                  register={form.register}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </form>
  );
}