import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Hammer,
  Loader2,
  Package,
  Terminal,
  UploadCloud,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { catalogApi } from '@/api/catalog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { cn } from '@/shared/utils/cn';
import {
  OPEN_BUILD_DIALOG_EVENT,
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
      /load metadata for docker\.io|from docker\.io|resolve docker\.io|pull token/.test(lower)
    ) {
      stageId = rankStage(stageId, 'pulling');
    }

    const layerMatch = line.match(
      /sha256:([a-f0-9]+).*?(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)\s*\/\s*(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)/i,
    );

    if (layerMatch) {
      const [, digest, , , totalValueRaw, totalUnit] = layerMatch;
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

    if (
      /building docker image|copy runner\.py|copy sdk|run pip|run apt-get|run chmod|run python|run python3|run mkdir|exporting to image|load build definition from dockerfile|transferring dockerfile/.test(
        lower,
      )
    ) {
      stageId = rankStage(stageId, 'building');
    }

    if (
      /push refers to repository|pushing|layer already exists|digest:\s*sha256|pushed|publishing/.test(
        lower,
      )
    ) {
      stageId = rankStage(stageId, 'pushing');
    }

    if (progress.status === 'failed' || /error:|failed to solve|denied:|unauthorized|no space left/i.test(lower)) {
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

function StageRow({
  title,
  description,
  icon: Icon,
  state,
}: {
  title: string;
  description: string;
  icon: typeof Package;
  state: 'done' | 'active' | 'pending' | 'failed';
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
          {state === 'active' ? <Badge>active</Badge> : null}
          {state === 'done' ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">done</Badge> : null}
          {state === 'failed' ? (
            <Badge className="bg-red-50 text-red-700 border-red-200">failed</Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function BootstrapBuilderDialog({ onSuccess }: { onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<BuilderStep>('form');
  const [loading, setLoading] = useState(false);
  const { build, startTracking, clearTracking } = useBootstrapBuildTracker();

  const [formData, setFormData] = useState({
    name: '',
    baseImage: 'python:3.11-slim',
    tag: '0.1.0',
    extraPackages: '',
    dockerUser: '',
    dockerPass: '',
  });

  const [dockerfile, setDockerfile] = useState('');
  const [buildId, setBuildId] = useState<string | null>(null);
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progress?.logs]);

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;

    if (step === 'building' && buildId) {
      interval = setInterval(async () => {
        try {
          const res = await catalogApi.getBuildProgress(buildId);
          setProgress(res);

          if (res.status === 'completed' || res.status === 'failed') {
            if (interval) clearInterval(interval);

            if (res.status === 'completed') {
              toast.success('Image published successfully');
              onSuccess?.();
            } else {
              toast.error('Build failed. Check logs for details.');
            }
          }
        } catch (error) {
          console.error('Failed to fetch build progress', error);
        }
      }, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [buildId, onSuccess, step]);

  useEffect(() => {
    if (!build) return;

    setBuildId(build.id);
    setProgress({
      status: build.status,
      logs: build.logs,
    });
    setStep('building');
  }, [build]);

  useEffect(() => {
    const handler = () => setOpen(true);

    window.addEventListener(OPEN_BUILD_DIALOG_EVENT, handler);

    return () => {
      window.removeEventListener(OPEN_BUILD_DIALOG_EVENT, handler);
    };
  }, []);

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
    if (!formData.name || !formData.baseImage || !formData.tag) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);

    try {
      const res = await catalogApi.previewDockerfile({
        baseImage: formData.baseImage,
        extraPackages: formData.extraPackages,
      });
      setDockerfile(res.dockerfile);
      setStep('preview');
    } catch (error) {
      console.error(error);
      toast.error('Failed to generate Dockerfile preview');
    } finally {
      setLoading(false);
    }
  };

  const handleStartBuild = async () => {
    if (!formData.dockerUser || !formData.dockerPass) {
      toast.error('Docker Hub credentials are required to publish');
      return;
    }

    setLoading(true);

    try {
      const res = await catalogApi.buildBootstrapImage(formData);

      startTracking({
        id: res.id,
        status: 'building',
        logs: ['Starting build...'],
        imageRef: `${formData.dockerUser}/${formData.name}:${formData.tag}`,
      });

      setBuildId(res.id);
      setProgress({
        status: 'building',
        logs: ['Starting build...'],
      });
      setStep('building');
    } catch (error) {
      console.error(error);
      toast.error('Failed to start build process');
    } finally {
      setLoading(false);
    }
  };

  const renderStageState = (index: number): 'done' | 'active' | 'pending' | 'failed' => {
    if (insights.stageId === 'failed') {
      if (index < activeStageIndex) return 'done';
      if (index === activeStageIndex) return 'failed';
      return 'pending';
    }

    if (insights.stageId === 'completed') {
      return 'done';
    }

    if (index < activeStageIndex) return 'done';
    if (index === activeStageIndex) return 'active';
    return 'pending';
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);

        if (!value) {
          // модалка закрывается, но активную сборку НЕ трогаем
          return;
        }

        if (build) {
          setBuildId(build.id);
          setProgress({
            status: build.status,
            logs: build.logs,
          });
          setStep('building');
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Hammer className="mr-2 h-4 w-4" />
          Create Bootstrap Image
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bootstrap Image Builder</DialogTitle>
          <DialogDescription>
            Build a self-contained worker image with one or more isolated Python
            environments, the Cloud Forge SDK, and an editable Dockerfile preview.
          </DialogDescription>
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-5 py-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Image name</Label>
                <Input
                  id="name"
                  placeholder="qwen-7b-train"
                  value={formData.name}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tag">Tag / Version</Label>
                <Input
                  id="tag"
                  placeholder="0.1.0"
                  value={formData.tag}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, tag: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="baseImage">Base Docker image</Label>
              <Input
                id="baseImage"
                placeholder="igortet/model-qwen-7b"
                value={formData.baseImage}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, baseImage: event.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                If this base image already contains model weights, the first build can
                take a long time and download tens of GB.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="packages">Extra pip packages (one per line)</Label>
              <Textarea
                id="packages"
                rows={8}
                placeholder={`unsloth
unsloth-zoo
bitsandbytes>=0.45.0
xformers==0.0.35
transformers>=4.48.0
datasets>=3.6.0`}
                value={formData.extraPackages}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, extraPackages: event.target.value }))
                }
              />
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Heads up for model-heavy base images</AlertTitle>
              <AlertDescription>
                Choosing a base image with embedded weights is convenient, but the initial
                pull can be very large. The builder will now show stages like base image
                pull, large layer download, build, and push.
              </AlertDescription>
            </Alert>

            <div className="flex justify-end pt-2">
              <Button onClick={handlePreview} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Next: Preview Dockerfile
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-5 py-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dockerfile preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-2xl bg-muted p-4 font-mono text-xs whitespace-pre overflow-x-auto">
                  {dockerfile}
                </div>
              </CardContent>
            </Card>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Docker Hub credentials</AlertTitle>
              <AlertDescription>
                These credentials are used only to push the final bootstrap image to your
                Docker Hub repository.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dockerUser">Username</Label>
                <Input
                  id="dockerUser"
                  placeholder="username"
                  value={formData.dockerUser}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, dockerUser: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dockerPass">Password / Access token</Label>
                <Input
                  id="dockerPass"
                  type="password"
                  placeholder="••••••••"
                  value={formData.dockerPass}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, dockerPass: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep('form')}>
                Back
              </Button>

              <Button onClick={handleStartBuild} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Build & Publish
              </Button>
            </div>
          </div>
        )}

        {step === 'building' && (
          <div className="space-y-5 py-4">
            <div className="flex items-center gap-3">
              {progress?.status === 'completed' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : progress?.status === 'failed' ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              )}

              <div>
                <p className="font-medium">
                  {progress?.status === 'completed'
                    ? 'Bootstrap image completed'
                    : progress?.status === 'failed'
                      ? 'Bootstrap image failed'
                      : 'The backend is building and pushing your bootstrap image'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Current stage:{' '}
                  <span className="font-medium">
                    {insights.stageId === 'failed'
                      ? 'failed'
                      : insights.stageId === 'completed'
                        ? 'completed'
                        : STAGE_META.find((item) => item.id === insights.stageId)?.title ?? 'Queued'}
                  </span>
                </p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Build stages</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {STAGE_META.map((stage, index) => (
                      <StageRow
                        key={stage.id}
                        title={stage.title}
                        description={stage.description}
                        icon={stage.icon}
                        state={renderStageState(index)}
                      />
                    ))}
                  </CardContent>
                </Card>

                {insights.largeLayers.length > 0 ? (
                  <Alert variant={hasHugeLayers ? 'warning' : 'default'}>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>
                      Large base-image layers detected
                    </AlertTitle>
                    <AlertDescription>
                      {hasHugeLayers ? (
                        <div className="space-y-2">
                          <p>
                            The builder is downloading very large layers from the selected
                            base image. The first build can take a long time and may require
                            tens of GB of free disk space.
                          </p>
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
                          <p>
                            Large container layers are being downloaded. This is expected for
                            model-heavy images and usually happens before the Dockerfile
                            steps start running.
                          </p>
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
                    <CardTitle className="text-base">Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Target image:</span>{' '}
                      <span className="font-medium">
                        {formData.dockerUser}/{formData.name}:{formData.tag}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Base image:</span>{' '}
                      <span className="font-medium break-all">{formData.baseImage}</span>
                    </div>
                    {insights.lastMeaningfulLine ? (
                      <div>
                        <span className="text-muted-foreground">Last log line:</span>{' '}
                        <span className="font-medium break-all">{insights.lastMeaningfulLine}</span>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Terminal className="h-4 w-4" />
                    Raw build logs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[540px] overflow-y-auto rounded-2xl bg-black p-4 font-mono text-[11px] text-white">
                    {progress?.logs.length ? (
                      progress.logs.map((log, index) => (
                        <div key={`${index}-${log.slice(0, 20)}`} className="mb-1 break-all leading-tight">
                          {log}
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-400">Waiting for build logs...</div>
                    )}
                    <div ref={logEndRef} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {progress?.status === 'completed' || progress?.status === 'failed' ? (
              <Button variant="ghost" onClick={clearTracking}>
                Clear build status
              </Button>
            ) : null}

            <div className="flex justify-end pt-1">
              <Button
                variant={
                  progress?.status === 'completed' || progress?.status === 'failed'
                    ? 'default'
                    : 'outline'
                }
                onClick={() => setOpen(false)}
              >
                {progress?.status === 'completed' || progress?.status === 'failed'
                  ? 'Close'
                  : 'Hide'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}