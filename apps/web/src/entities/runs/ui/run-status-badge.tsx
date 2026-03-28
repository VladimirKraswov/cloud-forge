import type { RunStatus } from '@/api/types';
import { Badge } from '@/shared/components/ui/badge';

const variants: Record<RunStatus, string> = {
  created: 'bg-amber-50 text-amber-700 border-amber-200',
  running: 'bg-blue-50 text-blue-700 border-blue-200',
  finished: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-700 border-slate-200',
  lost: 'bg-violet-50 text-violet-700 border-violet-200',
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return <Badge className={variants[status]}>{status}</Badge>;
}
