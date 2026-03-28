import type { WorkerStatus } from '@/api/types';
import { Badge } from '@/shared/components/ui/badge';

const variants: Record<WorkerStatus, string> = {
  online: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  busy: 'bg-blue-50 text-blue-700 border-blue-200',
  offline: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function WorkerStatusBadge({ status }: { status: WorkerStatus }) {
  return <Badge className={variants[status]}>{status}</Badge>;
}
