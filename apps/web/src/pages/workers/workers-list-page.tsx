import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Server } from 'lucide-react';
import { workersApi } from '@/api/workers';
import { WorkerStatusBadge } from '@/entities/workers/ui/worker-status-badge';
import { EmptyState } from '@/shared/components/app/empty-state';
import { PageHeader } from '@/shared/components/app/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { useI18n } from '@/shared/lib/i18n';
import { formatDateTime, formatRelative } from '@/shared/utils/format';

export function WorkersListPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const workersQuery = useQuery({ queryKey: ['workers'], queryFn: workersApi.list, refetchInterval: 10_000 });
  const filteredWorkers = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return workersQuery.data || [];
    return (workersQuery.data || []).filter((worker) => {
      const capabilities = JSON.stringify(worker.capabilities || {}).toLowerCase();
      return worker.name.toLowerCase().includes(value) || worker.id.toLowerCase().includes(value) || capabilities.includes(value);
    });
  }, [search, workersQuery.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.workers.title}
        title={t.workers.title}
        description={t.workers.description}
      />
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t.workers.filterPlaceholder}
          className="pl-10"
        />
      </div>
      {filteredWorkers.length ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredWorkers.map((worker) => (
            <Card key={worker.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{worker.name}</CardTitle>
                    <CardDescription>{worker.id}</CardDescription>
                  </div>
                  <WorkerStatusBadge status={worker.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t.workers.table.host}
                  </div>
                  <div className="mt-1">{worker.host || '—'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t.workers.table.lastSeen}
                  </div>
                  <div className="mt-1">
                    {worker.last_seen_at ? formatRelative(worker.last_seen_at) : t.common.never}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t.workers.table.created}
                  </div>
                  <div className="mt-1">{formatDateTime(worker.created_at)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t.workers.table.capabilities}
                  </div>
                  <pre className="custom-scrollbar mt-2 overflow-x-auto rounded-2xl bg-muted p-3 text-xs">
                    {JSON.stringify(worker.capabilities || {}, null, 2)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Server}
          title={t.workers.empty.title}
          description={t.workers.empty.description}
        />
      )}
    </div>
  );
}
