import { Card, CardContent } from '@/shared/components/ui/card';
import { useI18n } from '@/shared/lib/i18n';

export function AttachedFilesField() {
  const { t } = useI18n();

  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="p-6 text-sm text-muted-foreground">
        {t.forms.job.attachedFilesNote}
      </CardContent>
    </Card>
  );
}
