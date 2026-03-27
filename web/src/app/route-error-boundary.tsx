import { AlertTriangle } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

export function RouteErrorBoundary({ error }: { error: Error }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-border bg-card p-10 text-center shadow-[var(--shadow-soft)]">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="max-w-lg text-sm text-muted-foreground">{error.message}</p>
      </div>
      <Button onClick={() => window.location.reload()}>Reload application</Button>
    </div>
  );
}
