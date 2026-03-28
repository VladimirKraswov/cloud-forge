import { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { catalogApi } from '@/api/catalog';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useI18n } from '@/shared/lib/i18n';
import {
  requestOpenBootstrapBuildDialog,
  useBootstrapBuildTracker,
} from './model/use-bootstrap-build-tracker';

function getStatusLabel(status?: string) {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'building';
  }
}

export function BootstrapBuildFloating() {
  const { build, isActive, isFinished, clearTracking } = useBootstrapBuildTracker();
  const [cancelling, setCancelling] = useState(false);
  const { t, lang } = useI18n();

  if (!build) return null;

  const labels =
    lang === 'ru'
      ? {
          cancelled: 'Сборка отменена.',
          cancelling: 'Отмена...',
          cancelBuild: 'Отменить сборку',
          failed: 'Сборка завершилась ошибкой или была отменена.',
          newBuild: 'Новая сборка',
        }
      : {
          cancelled: 'Build cancelled.',
          cancelling: 'Cancelling...',
          cancelBuild: 'Cancel build',
          failed: 'Build failed or was cancelled.',
          newBuild: 'New build',
        };

  const handleCancel = async () => {
    if (!build.id) return;

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

  const statusMessage =
    build.status === 'completed'
      ? t.floating.buildCompleted
      : build.status === 'cancelled'
        ? labels.cancelled
        : isActive
          ? t.floating.buildInProgress
          : labels.failed;

  return (
    <div className="fixed bottom-4 right-4 z-[100] w-[380px] max-w-[calc(100vw-2rem)]">
      <Card className="border shadow-2xl">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {isActive ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : build.status === 'completed' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">
                  {build.imageRef || 'Bootstrap image build'}
                </p>
                <Badge variant="outline">{getStatusLabel(build.status)}</Badge>
              </div>

              <p className="mt-1 text-sm text-muted-foreground">{statusMessage}</p>

              {build.logs?.length ? (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {build.logs[build.logs.length - 1]}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {isFinished ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => requestOpenBootstrapBuildDialog('new')}
                    >
                      {labels.newBuild}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => requestOpenBootstrapBuildDialog('resume')}
                    >
                      {t.floating.openMonitor}
                    </Button>

                    <Button size="sm" variant="ghost" onClick={clearTracking}>
                      {t.floating.dismiss}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      onClick={() => requestOpenBootstrapBuildDialog('resume')}
                    >
                      {t.floating.openMonitor}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={cancelling}
                      onClick={handleCancel}
                    >
                      {cancelling ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          {labels.cancelling}
                        </>
                      ) : (
                        labels.cancelBuild
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}