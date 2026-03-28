import { Card, CardContent } from '@/shared/components/ui/card';
import { useI18n } from '@/shared/lib/i18n';

export function ContainersFieldArray() {
  const { t } = useI18n();

  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="p-6 text-sm text-muted-foreground">
        {t.forms.job.containersNote}
      </CardContent>
    </Card>
  );
}
