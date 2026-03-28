import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Hammer,
  HelpCircle,
  Loader2,
  Package,
  Terminal,
  UploadCloud,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { catalogApi } from '@/api/catalog';
import type { ExecutionLanguage } from '@/api/types';
import { LanguageSwitcher } from '@/shared/components/app/language-switcher';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';
import { useI18n } from '@/shared/lib/i18n';
import { cn } from '@/shared/utils/cn';
import {
  OPEN_BUILD_DIALOG_EVENT,
  type BuildDialogIntent,
  useBootstrapBuildTracker,
} from './model/use-bootstrap-build-tracker';

type BuilderStep = 'form' | 'preview' | 'building';

type BuildStageId =
  | 'queued'
  | 'assets'
  | 'pulling'
  | 'downloading'
  | 'building'
  | 'pushing'
  | 'completed'
  | 'failed';

type BuildProgress = {
  status: string;
  logs: string[];
};

type LayerInsight = {
  digest: string;
  sizeLabel: string;
  bytes: number;
};

type BuildInsights = {
  stageId: BuildStageId;
  largeLayers: LayerInsight[];
  lastMeaningfulLine: string | null;
};

type BuilderFormState = {
  name: string;
  baseImage: string;
  tag: string;
  executionLanguage: ExecutionLanguage;
  extraDependencies: string;
  dockerUser: string;
  dockerPass: string;
};

const STAGE_META: Array<{
  id: Exclude<BuildStageId, 'completed' | 'failed'>;
  title: string;
  description: string;
  icon: typeof Package;
}> = [
  {
    id: 'queued',
    title: 'Queued',
    description: 'Preparing build request and generating context.',
    icon: Hammer,
  },
  {
    id: 'assets',
    title: 'Runtime assets',
    description: 'Injecting Cloud Forge runtime assets and SDK files.',
    icon: Package,
  },
  {
    id: 'pulling',
    title: 'Base image',
    description: 'Resolving and pulling the selected base image.',
    icon: Download,
  },
  {
    id: 'downloading',
    title: 'Large layers',
    description: 'Downloading and extracting container layers.',
    icon: Download,
  },
  {
    id: 'building',
    title: 'Build image',
    description: 'Executing Dockerfile steps and creating the derived image.',
    icon: Wrench,
  },
  {
    id: 'pushing',
    title: 'Push image',
    description: 'Publishing the final bootstrap image to Docker Hub.',
    icon: UploadCloud,
  },
];

const stageRank: Record<BuildStageId, number> = {
  queued: 0,
  assets: 1,
  pulling: 2,
  downloading: 3,
  building: 4,
  pushing: 5,
  completed: 6,
  failed: 6,
};

const baseInfoSchema = z.object({
  name: z
    .string()
    .min(1, 'Image name is required')
    .regex(
      /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/,
      'Invalid image name. Use lowercase, numbers, dots, underscores, or dashes.',
    ),
  tag: z
    .string()
    .min(1, 'Tag is required')
    .regex(
      /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/,
      'Invalid tag. Use lowercase, numbers, dots, underscores, or dashes.',
    ),
  baseImage: z.string().min(1, 'Base image is required'),
  executionLanguage: z.enum(['python', 'javascript']),
  extraDependencies: z.string(),
});

const credentialsSchema = z.object({
  dockerUser: z.string().min(1, 'Docker Hub username is required'),
  dockerPass: z.string().min(1, 'Docker Hub password is required'),
});

const buildFormSchema = baseInfoSchema.merge(credentialsSchema);

function getDefaultBaseImage(language: ExecutionLanguage) {
  return language === 'javascript' ? 'node:20-slim' : 'python:3.11-slim';
}

function getDefaultFormData(language: ExecutionLanguage = 'python'): BuilderFormState {
  return {
    name: '',
    baseImage: getDefaultBaseImage(language),
    tag: '0.1.0',
    executionLanguage: language,
    extraDependencies: '',
    dockerUser: '',
    dockerPass: '',
  };
}

function rankStage(current: BuildStageId, next: BuildStageId): BuildStageId {
  return stageRank[next] > stageRank[current] ? next : current;
}

function toBytes(value: number, unit: string) {
  const normalized = unit.toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };

  return value * (multipliers[normalized] ?? 1);
}

function parseBuildInsights(progress: BuildProgress | null): BuildInsights {
  if (!progress) {
    return {
      stageId: 'queued',
      largeLayers: [],
      lastMeaningfulLine: null,
    };
  }

  if (progress.status === 'completed') {
    return {
      stageId: 'completed',
      largeLayers: [],
      lastMeaningfulLine: progress.logs.at(-1) ?? null,
    };
  }

  const layerMap = new Map<string, LayerInsight>();
  let stageId: BuildStageId = progress.status === 'failed' ? 'failed' : 'queued';
  let lastMeaningfulLine: string | null = null;

  for (const rawLine of progress.logs) {
    const line = rawLine.trim();
    if (!line) continue;

    const lower = line.toLowerCase();
    lastMeaningfulLine = line;

    if (lower.includes('using runtime assets')) {
      stageId = rankStage(stageId, 'assets');
    }

    if (
      /load metadata for|from docker\.io|resolve docker\.io|pull token|pulling from|pulling fs layer/.test(
        lower,
      )
    ) {
      stageId = rankStage(stageId, 'pulling');
    }

    const sizedLayerMatch = line.match(
      /sha256:([a-f0-9]+).*?(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)\s*\/\s*(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)/i,
    );
    const pullingLayerMatch = line.match(/([a-z0-9]{12}):\s*Pulling\s*fs\s*layer/i);

    if (sizedLayerMatch) {
      const digest = sizedLayerMatch[1];
      const totalValueRaw = sizedLayerMatch[4];
      const totalUnit = sizedLayerMatch[5];

      if (digest && totalValueRaw && totalUnit) {
        const totalValue = Number(totalValueRaw);
        const bytes = toBytes(totalValue, totalUnit);
        const sizeLabel = `${totalValueRaw}${totalUnit.toUpperCase()}`;

        stageId = rankStage(stageId, 'downloading');

        const existing = layerMap.get(digest);
        if (!existing || bytes > existing.bytes) {
          layerMap.set(digest, {
            digest,
            sizeLabel,
            bytes,
          });
        }
      }
    } else if (pullingLayerMatch) {
      const digest = pullingLayerMatch[1];

      if (digest) {
        stageId = rankStage(stageId, 'downloading');

        if (!layerMap.has(digest)) {
          layerMap.set(digest, {
            digest,
            sizeLabel: 'unknown',
            bytes: 0,
          });
        }
      }
    }

    if (
      /building docker image|copy runner\.py|copy sdk|run pip|run npm|run apt-get|run chmod|run python|run python3|run node|run mkdir|exporting to image|load build definition from dockerfile|transferring dockerfile|step\s*\d+\/\d+/.test(
        lower,
      )
    ) {
      stageId = rankStage(stageId, 'building');
    }

    if (
      /push refers to repository|pushing|layer already exists|digest:\s*sha256|pushed|publishing|preparing\s*to\s*push/.test(
        lower,
      )
    ) {
      stageId = rankStage(stageId, 'pushing');
    }

    if (
      progress.status === 'failed' ||
      /error:|failed to solve|denied:|unauthorized|no space left/i.test(lower)
    ) {
      stageId = 'failed';
    }
  }

  const largeLayers = Array.from(layerMap.values())
    .filter((layer) => layer.bytes >= 1024 ** 3)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 5);

  return {
    stageId,
    largeLayers,
    lastMeaningfulLine,
  };
}

function LabelWithHelp({
  label,
  help,
  htmlFor,
  className,
}: {
  label: string;
  help: string;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="group relative">
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground" />
        <div className="absolute bottom-full left-1/2 z-50 mb-2 hidden w-48 -translate-x-1/2 rounded-lg border bg-popover p-2 text-[10px] leading-tight text-popover-foreground shadow-md group-hover:block">
          {help}
          <div className="absolute left-1/2 top-full -ml-1 border-4 border-transparent border-t-border" />
        </div>
      </div>
    </div>
  );
}

function StageRow({
  title,
  description,
  icon: Icon,
  state,
  activeLabel,
  doneLabel,
  failedLabel,
}: {
  title: string;
  description: string;
  icon: typeof Package;
  state: 'done' | 'active' | 'pending' | 'failed';
  activeLabel: string;
  doneLabel: string;
  failedLabel: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl border p-4 transition-colors',
        state === 'done' && 'border-emerald-200 bg-emerald-50',
        state === 'active' && 'border-primary/40 bg-primary/5',
        state === 'pending' && 'border-border bg-card',
        state === 'failed' && 'border-destructive/30 bg-destructive/5',
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
          state === 'done' && 'bg-emerald-100 text-emerald-700',
          state === 'active' && 'bg-primary/10 text-primary',
          state === 'pending' && 'bg-muted text-muted-foreground',
          state === 'failed' && 'bg-destructive/10 text-destructive',
        )}
      >
        {state === 'done' ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : state === 'active' ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : state === 'failed' ? (
          <AlertCircle className="h-5 w-5" />
        ) : (
          <Icon className="h-5 w-5" />
        )}
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium">{title}</p>
          {state === 'active' ? <Badge>{activeLabel}</Badge> : null}
          {state === 'done' ? (
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
              {doneLabel}
            </Badge>
          ) : null}
          {state === 'failed' ? (
            <Badge className="border-red-200 bg-red-50 text-red-700">{failedLabel}</Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function isTerminalStatus(status?: string | null) {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export function BootstrapBuilderDialog({ onSuccess }: { onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [dialogIntent, setDialogIntent] = useState<BuildDialogIntent>('new');
  const [step, setStep] = useState<BuilderStep>('form');
  const [loading, setLoading] = useState(false);
  const { build, startTracking, clearTracking, isActive } = useBootstrapBuildTracker();
  const { t, lang } = useI18n();

  const [formData, setFormData] = useState<BuilderFormState>(() => getDefaultFormData('python'));
  const [dockerfile, setDockerfile] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const previousTrackedStatusRef = useRef<string | null>(build?.status ?? null);

  const progress: BuildProgress | null = build
    ? {
        status: build.status,
        logs: build.logs,
      }
    : null;

  const labels =
    lang === 'ru'
      ? {
          executionLanguage: 'Язык выполнения',
          executionLanguageHelp:
            'Определяет SDK и тип минимального рантайма внутри bootstrap-образа.',
          python: 'Python',
          javascript: 'JavaScript',
          extraDependencies: 'Доп. зависимости',
          extraDependenciesHelp:
            'Для Python — pip пакеты по одному на строку. Для JavaScript — npm пакеты по одному на строку.',
          dependenciesPlaceholderPython: `requests
pandas
numpy`,
          dependenciesPlaceholderJavascript: `axios
zod
dotenv`,
          dependencyNotePython:
            'Будут установлены Python-зависимости для окружения по умолчанию.',
          dependencyNoteJavascript:
            'Будут установлены JS/npm-зависимости. Бэкенд должен интерпретировать это как javascript stack.',
          buildCancelled: 'Сборка отменена',
          newBuild: 'Новая сборка',
          closeAndReset: 'Закрыть и начать заново',
        }
      : {
          executionLanguage: 'Execution language',
          executionLanguageHelp:
            'Determines which SDK and default runtime stack will be installed into the bootstrap image.',
          python: 'Python',
          javascript: 'JavaScript',
          extraDependencies: 'Extra dependencies',
          extraDependenciesHelp:
            'For Python: pip packages, one per line. For JavaScript: npm packages, one per line.',
          dependenciesPlaceholderPython: `requests
pandas
numpy`,
          dependenciesPlaceholderJavascript: `axios
zod
dotenv`,
          dependencyNotePython:
            'These lines will be installed as Python dependencies for the default environment.',
          dependencyNoteJavascript:
            'These lines will be installed as JS/npm dependencies. Backend should interpret them as javascript stack dependencies.',
          buildCancelled: 'Build cancelled',
          newBuild: 'New build',
          closeAndReset: 'Close and start over',
        };

  useEffect(() => {
    if (autoScroll) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [autoScroll, progress?.logs]);

  useEffect(() => {
    const previousStatus = previousTrackedStatusRef.current;
    const currentStatus = build?.status ?? null;

    if (previousStatus !== currentStatus && currentStatus === 'completed') {
      onSuccess?.();
    }

    previousTrackedStatusRef.current = currentStatus;
  }, [build?.status, onSuccess]);

  const handleLogScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const isAtBottom =
      Math.abs(target.scrollHeight - target.clientHeight - target.scrollTop) < 20;

    if (autoScroll !== isAtBottom) {
      setAutoScroll(isAtBottom);
    }
  };

  const openNewBuildForm = () => {
    setDialogIntent('new');
    setStep('form');
    setFormErrors({});
    setDockerfile('');
    setAutoScroll(true);
    setFormData(getDefaultFormData('python'));
    setOpen(true);
  };

  const syncDialogView = (intent: BuildDialogIntent) => {
    if (build && (!isTerminalStatus(build.status) || intent === 'resume')) {
      setStep('building');
      return;
    }

    setStep('form');
  };

  const handleCancel = async () => {
    if (!build?.id) return;

    setCancelling(true);
    try {
      await catalogApi.cancelBuild(build.id);
      toast.success('Build cancellation requested');
    } catch (error) {
      console.error(error);
      toast.error('Failed to cancel build');
    } finally {
      setCancelling(false);
    }
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ intent?: BuildDialogIntent }>;
      const intent = customEvent.detail?.intent ?? 'resume';
      setDialogIntent(intent);
      setOpen(true);

      if (build && (!isTerminalStatus(build.status) || intent === 'resume')) {
        setStep('building');
      } else {
        setStep('form');
      }
    };

    window.addEventListener(OPEN_BUILD_DIALOG_EVENT, handler);

    return () => {
      window.removeEventListener(OPEN_BUILD_DIALOG_EVENT, handler);
    };
  }, [build]);

  const insights = useMemo(() => parseBuildInsights(progress), [progress]);

  const activeStageIndex = useMemo(() => {
    if (insights.stageId === 'failed') {
      return Math.max(
        0,
        STAGE_META.findIndex((item) => item.id === 'building'),
      );
    }

    if (insights.stageId === 'completed') {
      return STAGE_META.length - 1;
    }

    const index = STAGE_META.findIndex((item) => item.id === insights.stageId);
    return index >= 0 ? index : 0;
  }, [insights.stageId]);

  const largestLayer = insights.largeLayers[0];
  const hasHugeLayers = Boolean(largestLayer && largestLayer.bytes >= 5 * 1024 ** 3);

  const handlePreview = async () => {
    const result = baseInfoSchema.safeParse(formData);

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0].toString()] = err.message;
        }
      });
      setFormErrors(errors);
      toast.error('Please fix validation errors');
      return;
    }

    setFormErrors({});
    setLoading(true);

    try {
      const response = await catalogApi.previewDockerfile({
        baseImage: formData.baseImage,
        executionLanguage: formData.executionLanguage,
        environments: [
          {
            name: 'default',
            requirements_text: formData.extraDependencies,
          },
        ],
      });

      setDockerfile(response.dockerfile);
      setStep('preview');
    } catch (error) {
      console.error(error);
      toast.error('Failed to generate Dockerfile preview');
    } finally {
      setLoading(false);
    }
  };

  const handleStartBuild = async () => {
    const result = buildFormSchema.safeParse(formData);

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0].toString()] = err.message;
        }
      });
      setFormErrors(errors);
      toast.error('Please fix validation errors');
      return;
    }

    setFormErrors({});
    setLoading(true);

    try {
      const response = await catalogApi.buildBootstrapImage({
        name: formData.name,
        baseImage: formData.baseImage,
        tag: formData.tag,
        executionLanguage: formData.executionLanguage,
        dockerUser: formData.dockerUser,
        dockerPass: formData.dockerPass,
        dockerfileText: dockerfile,
        environments: [
          {
            name: 'default',
            requirements_text: formData.extraDependencies,
          },
        ],
      });

      startTracking({
        id: response.id,
        status: response.status ?? 'building',
        logs: ['Starting build...'],
        imageRef: `${formData.dockerUser}/${formData.name}:${formData.tag}`,
      });

      setDialogIntent('resume');
      setStep('building');
    } catch (error) {
      console.error(error);
      toast.error('Failed to start build process');
    } finally {
      setLoading(false);
    }
  };

  const renderStageState = (
    index: number,
  ): 'done' | 'active' | 'pending' | 'failed' => {
    if (progress?.status === 'failed' || progress?.status === 'cancelled') {
      if (index < activeStageIndex) return 'done';
      if (index === activeStageIndex) return 'failed';
      return 'pending';
    }

    if (progress?.status === 'completed' || insights.stageId === 'completed') {
      return 'done';
    }

    if (index < activeStageIndex) return 'done';
    if (index === activeStageIndex) return 'active';
    return 'pending';
  };

  const currentStageLabel =
    progress?.status === 'cancelled'
      ? labels.buildCancelled
      : progress?.status === 'failed'
        ? 'failed'
        : progress?.status === 'completed'
          ? 'completed'
          : t.catalog.stages[
              insights.stageId as Exclude<BuildStageId, 'completed' | 'failed'>
            ]?.title ?? 'Queued';

  const dependencyPlaceholder =
    formData.executionLanguage === 'javascript'
      ? labels.dependenciesPlaceholderJavascript
      : labels.dependenciesPlaceholderPython;

  const dependencyNote =
    formData.executionLanguage === 'javascript'
      ? labels.dependencyNoteJavascript
      : labels.dependencyNotePython;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);

        if (!value) {
          return;
        }

        syncDialogView(dialogIntent);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          onClick={() => {
            setDialogIntent('new');
            if (!isActive) {
              setFormData(getDefaultFormData('python'));
              setDockerfile('');
              setFormErrors({});
            }
          }}
        >
          <Hammer className="mr-2 h-4 w-4" />
          {t.catalog.createBootstrap}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <DialogTitle>{t.catalog.builderTitle}</DialogTitle>
            <DialogDescription>{t.catalog.builderDescription}</DialogDescription>
          </div>

          <LanguageSwitcher compact className="mr-6" />
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-5 py-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <LabelWithHelp
                  label={labels.executionLanguage}
                  help={labels.executionLanguageHelp}
                  htmlFor="executionLanguage"
                />
                <Select
                  value={formData.executionLanguage}
                  onValueChange={(value) => {
                    const nextLanguage = value as ExecutionLanguage;

                    setFormData((prev) => {
                      const previousDefaultBaseImage = getDefaultBaseImage(
                        prev.executionLanguage,
                      );
                      const nextDefaultBaseImage = getDefaultBaseImage(nextLanguage);
                      const shouldReplaceBaseImage =
                        !prev.baseImage.trim() || prev.baseImage === previousDefaultBaseImage;

                      return {
                        ...prev,
                        executionLanguage: nextLanguage,
                        baseImage: shouldReplaceBaseImage
                          ? nextDefaultBaseImage
                          : prev.baseImage,
                      };
                    });
                  }}
                >
                  <SelectTrigger id="executionLanguage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="python">{labels.python}</SelectItem>
                    <SelectItem value="javascript">{labels.javascript}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <LabelWithHelp
                  label={t.catalog.baseImage}
                  help={t.catalog.baseImageHelp}
                  htmlFor="baseImage"
                  className={cn(formErrors.baseImage && 'text-destructive')}
                />
                <Input
                  id="baseImage"
                  placeholder={
                    formData.executionLanguage === 'javascript'
                      ? 'node:20-slim'
                      : 'python:3.11-slim'
                  }
                  className={cn(formErrors.baseImage && 'border-destructive')}
                  value={formData.baseImage}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, baseImage: event.target.value }))
                  }
                />
                {formErrors.baseImage ? (
                  <p className="text-xs font-medium text-destructive">
                    {formErrors.baseImage}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  If this base image already contains model weights, the first build can
                  take a long time and download tens of GB.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <LabelWithHelp
                  label={t.catalog.imageName}
                  help={t.catalog.imageNameHelp}
                  htmlFor="name"
                  className={cn(formErrors.name && 'text-destructive')}
                />
                <Input
                  id="name"
                  placeholder="qwen-7b-train"
                  className={cn(formErrors.name && 'border-destructive')}
                  value={formData.name}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
                {formErrors.name ? (
                  <p className="text-xs font-medium text-destructive">{formErrors.name}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <LabelWithHelp
                  label={t.catalog.tag}
                  help={t.catalog.tagHelp}
                  htmlFor="tag"
                  className={cn(formErrors.tag && 'text-destructive')}
                />
                <Input
                  id="tag"
                  placeholder="0.1.0"
                  className={cn(formErrors.tag && 'border-destructive')}
                  value={formData.tag}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, tag: event.target.value }))
                  }
                />
                {formErrors.tag ? (
                  <p className="text-xs font-medium text-destructive">{formErrors.tag}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <LabelWithHelp
                label={labels.extraDependencies}
                help={labels.extraDependenciesHelp}
                htmlFor="packages"
              />
              <Textarea
                id="packages"
                rows={8}
                placeholder={dependencyPlaceholder}
                value={formData.extraDependencies}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    extraDependencies: event.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">{dependencyNote}</p>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t.catalog.headsUpTitle}</AlertTitle>
              <AlertDescription>{t.catalog.headsUpDesc}</AlertDescription>
            </Alert>

            <div className="flex justify-end pt-2">
              <Button onClick={handlePreview} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t.catalog.nextPreview}
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-5 py-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.catalog.dockerfilePreview}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto whitespace-pre rounded-2xl bg-muted p-4 font-mono text-xs">
                  {dockerfile}
                </div>
              </CardContent>
            </Card>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t.help.dockerHubCredsTitle}</AlertTitle>
              <AlertDescription>{t.help.dockerHubCredsDesc}</AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <LabelWithHelp
                  label={t.catalog.dockerHubUser}
                  help={t.catalog.dockerHubUserHelp}
                  htmlFor="dockerUser"
                  className={cn(formErrors.dockerUser && 'text-destructive')}
                />
                <Input
                  id="dockerUser"
                  placeholder="username"
                  className={cn(formErrors.dockerUser && 'border-destructive')}
                  value={formData.dockerUser}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, dockerUser: event.target.value }))
                  }
                />
                {formErrors.dockerUser ? (
                  <p className="text-xs font-medium text-destructive">
                    {formErrors.dockerUser}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <LabelWithHelp
                  label={t.catalog.dockerHubPass}
                  help={t.catalog.dockerHubPassHelp}
                  htmlFor="dockerPass"
                  className={cn(formErrors.dockerPass && 'text-destructive')}
                />
                <Input
                  id="dockerPass"
                  type="password"
                  placeholder="••••••••"
                  className={cn(formErrors.dockerPass && 'border-destructive')}
                  value={formData.dockerPass}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, dockerPass: event.target.value }))
                  }
                />
                {formErrors.dockerPass ? (
                  <p className="text-xs font-medium text-destructive">
                    {formErrors.dockerPass}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep('form')}>
                {t.catalog.back}
              </Button>

              <Button onClick={handleStartBuild} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t.catalog.buildAndPublish}
              </Button>
            </div>
          </div>
        )}

        {step === 'building' && (
          <div className="space-y-5 py-4">
            <div className="flex items-center gap-3">
              {progress?.status === 'completed' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : progress?.status === 'failed' || progress?.status === 'cancelled' ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              )}

              <div>
                <p className="font-medium">
                  {progress?.status === 'completed'
                    ? t.catalog.completed
                    : progress?.status === 'failed'
                      ? t.catalog.failed
                      : progress?.status === 'cancelled'
                        ? labels.buildCancelled
                        : t.catalog.building}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t.catalog.currentStage}:{' '}
                  <span className="font-medium">{currentStageLabel}</span>
                </p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t.catalog.buildStages}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {STAGE_META.map((stage, index) => (
                      <StageRow
                        key={stage.id}
                        title={
                          t.catalog.stages[
                            stage.id as Exclude<BuildStageId, 'completed' | 'failed'>
                          ].title
                        }
                        description={
                          t.catalog.stages[
                            stage.id as Exclude<BuildStageId, 'completed' | 'failed'>
                          ].description
                        }
                        icon={stage.icon}
                        state={renderStageState(index)}
                        activeLabel={t.common.active}
                        doneLabel={t.common.done}
                        failedLabel={t.common.failed}
                      />
                    ))}
                  </CardContent>
                </Card>

                {insights.largeLayers.length > 0 ? (
                  <Alert variant={hasHugeLayers ? 'warning' : 'default'}>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{t.catalog.largeLayersTitle}</AlertTitle>
                    <AlertDescription>
                      {hasHugeLayers ? (
                        <div className="space-y-2">
                          <p>{t.catalog.largeLayersWarning}</p>
                          <div className="flex flex-wrap gap-2">
                            {insights.largeLayers.map((layer) => (
                              <Badge
                                key={layer.digest}
                                className="border-amber-200 bg-amber-50 text-amber-800"
                              >
                                {layer.sizeLabel} · {layer.digest.slice(0, 12)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p>{t.catalog.largeLayersInfo}</p>
                          <div className="flex flex-wrap gap-2">
                            {insights.largeLayers.map((layer) => (
                              <Badge key={layer.digest}>
                                {layer.sizeLabel} · {layer.digest.slice(0, 12)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                ) : null}

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t.catalog.summary}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">{t.catalog.targetImage}:</span>{' '}
                      <span className="font-medium">
                        {build?.imageRef ||
                          `${formData.dockerUser}/${formData.name}:${formData.tag}`}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{labels.executionLanguage}:</span>{' '}
                      <span className="font-medium">
                        {formData.executionLanguage === 'javascript'
                          ? labels.javascript
                          : labels.python}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t.catalog.baseImageLabel}:</span>{' '}
                      <span className="break-all font-medium">{formData.baseImage}</span>
                    </div>
                    {insights.lastMeaningfulLine ? (
                      <div>
                        <span className="text-muted-foreground">{t.catalog.lastLogLine}:</span>{' '}
                        <span className="break-all font-medium">
                          {insights.lastMeaningfulLine}
                        </span>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Terminal className="h-4 w-4" />
                    {t.catalog.rawLogs}
                  </CardTitle>
                  {!autoScroll && !isTerminalStatus(progress?.status) ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => setAutoScroll(true)}
                    >
                      {t.catalog.resumeAutoScroll}
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent>
                  <div
                    className="h-[540px] overflow-y-auto rounded-2xl bg-black p-4 font-mono text-[11px] text-white"
                    onScroll={handleLogScroll}
                  >
                    {progress?.logs.length ? (
                      progress.logs.map((log, index) => (
                        <div
                          key={`${index}-${log.slice(0, 20)}`}
                          className="mb-1 break-all leading-tight"
                        >
                          {log}
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-400">{t.catalog.waitingLogs}</div>
                    )}
                    <div ref={logEndRef} />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                {isTerminalStatus(progress?.status) ? (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" size="sm" onClick={clearTracking}>
                      {t.catalog.clearStatus}
                    </Button>
                    <Button variant="outline" size="sm" onClick={openNewBuildForm}>
                      {labels.newBuild}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={cancelling}
                    onClick={handleCancel}
                  >
                    {cancelling ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        {t.catalog.cancelling}
                      </>
                    ) : (
                      t.catalog.cancelBuild
                    )}
                  </Button>
                )}
              </div>

              <Button
                variant={isTerminalStatus(progress?.status) ? 'default' : 'outline'}
                onClick={() => {
                  if (isTerminalStatus(progress?.status) && dialogIntent === 'new') {
                    openNewBuildForm();
                    return;
                  }
                  setOpen(false);
                }}
              >
                {isTerminalStatus(progress?.status) ? t.catalog.close : t.catalog.hide}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}