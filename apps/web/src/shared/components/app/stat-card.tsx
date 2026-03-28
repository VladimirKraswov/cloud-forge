import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/shared/components/ui/card';

export function StatCard({ title, value, subtitle, icon: Icon }: { title: string; value: string | number; subtitle?: string; icon: LucideIcon; }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-6">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
          {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
