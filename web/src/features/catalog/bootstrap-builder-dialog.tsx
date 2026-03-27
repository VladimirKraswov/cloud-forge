import { useState, useEffect, useRef } from 'react';
import { Hammer, Loader2, Terminal, AlertCircle } from 'lucide-react';
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
import { toast } from 'sonner';

export function BootstrapBuilderDialog({ onSuccess }: { onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'form' | 'preview' | 'building'>('form');
  const [loading, setLoading] = useState(false);

  // Form state
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
  const [progress, setProgress] = useState<{ status: string; logs: string[] } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progress?.logs]);

  // Polling for build progress
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step === 'building' && buildId) {
      interval = setInterval(async () => {
        try {
          const res = await catalogApi.getBuildProgress(buildId);
          setProgress(res);
          if (res.status === 'completed' || res.status === 'failed') {
            clearInterval(interval);
            if (res.status === 'completed') {
              toast.success('Image published successfully!');
              onSuccess?.();
            } else {
              toast.error('Build failed. Check logs for details.');
            }
          }
        } catch (err) {
          console.error('Failed to fetch build progress', err);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [step, buildId, onSuccess]);

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
    } catch (err) {
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
      setBuildId(res.id);
      setStep('building');
      setProgress({ status: 'building', logs: ['Build queued...'] });
    } catch (err) {
      toast.error('Failed to start build process');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      setOpen(val);
      if (!val) {
        setStep('form');
        setBuildId(null);
        setProgress(null);
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Hammer className="mr-2 h-4 w-4" />
          Create Bootstrap Image
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bootstrap Image Builder</DialogTitle>
          <DialogDescription>
            Create a custom worker image with your models and dependencies.
          </DialogDescription>
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Image Name</Label>
                <Input
                  id="name"
                  placeholder="my-qwen-7b-worker"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tag">Tag / Version</Label>
                <Input
                  id="tag"
                  placeholder="0.1.0"
                  value={formData.tag}
                  onChange={e => setFormData({...formData, tag: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="baseImage">Base Docker Image</Label>
              <Input
                id="baseImage"
                placeholder="python:3.11-slim"
                value={formData.baseImage}
                onChange={e => setFormData({...formData, baseImage: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="packages">Extra pip packages (one per line)</Label>
              <Textarea
                id="packages"
                placeholder="transformers&#10;torch&#10;accelerate"
                rows={4}
                value={formData.extraPackages}
                onChange={e => setFormData({...formData, extraPackages: e.target.value})}
              />
            </div>

            <div className="pt-4 flex justify-end">
              <Button onClick={handlePreview} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Next: Preview Dockerfile
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4 py-4">
            <div className="bg-muted p-4 rounded-lg font-mono text-xs whitespace-pre overflow-x-auto">
              {dockerfile}
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Docker Hub Credentials</AlertTitle>
              <AlertDescription>
                We need your credentials to push the image to your repository.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dockerUser">Username</Label>
                <Input
                  id="dockerUser"
                  placeholder="username"
                  value={formData.dockerUser}
                  onChange={e => setFormData({...formData, dockerUser: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dockerPass">Password / Token</Label>
                <Input
                  id="dockerPass"
                  type="password"
                  placeholder="••••••••"
                  value={formData.dockerPass}
                  onChange={e => setFormData({...formData, dockerPass: e.target.value})}
                />
              </div>
            </div>

            <div className="pt-4 flex justify-between">
              <Button variant="ghost" onClick={() => setStep('form')}>Back</Button>
              <Button onClick={handleStartBuild} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Build & Publish
              </Button>
            </div>
          </div>
        )}

        {step === 'building' && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              {progress?.status !== 'completed' && progress?.status !== 'failed' ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : progress?.status === 'completed' ? (
                <Terminal className="h-5 w-5 text-emerald-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
              <span className="font-medium capitalize">{progress?.status}...</span>
            </div>

            <div className="bg-black text-white p-4 rounded-lg font-mono text-[10px] h-80 overflow-y-auto">
              {progress?.logs.map((log, i) => (
                <div key={i} className="mb-1 leading-tight break-all">
                  {log}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant={progress?.status === 'completed' || progress?.status === 'failed' ? 'default' : 'outline'}
                onClick={() => setOpen(false)}
              >
                {progress?.status === 'completed' || progress?.status === 'failed' ? 'Close' : 'Cancel Build'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
