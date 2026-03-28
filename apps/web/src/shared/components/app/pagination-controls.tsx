import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { useI18n } from '@/shared/lib/i18n';

export function PaginationControls({ page, pageSize, total, onPageChange }: { page: number; pageSize: number; total: number; onPageChange: (nextPage: number) => void; }) {
  const { t } = useI18n();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const canPrevious = page > 1;
  const canNext = page < pageCount;

  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">
        {t.common.pageOf
          .replace('{page}', page.toString())
          .replace('{pages}', pageCount.toString())
          .replace('{total}', total.toString())}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={!canPrevious} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
          {t.common.prev}
        </Button>
        <Button variant="outline" size="sm" disabled={!canNext} onClick={() => onPageChange(page + 1)}>
          {t.common.next}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
