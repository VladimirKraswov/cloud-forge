import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';
import { useI18n } from '@/shared/lib/i18n';

export function CopyButton({
  value,
  label,
}: {
  value: string;
  label?: string;
}) {
  const { t } = useI18n();
  const successLabel = label || t.common.copied;

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success(successLabel);
        } catch (error) {
          console.error('Failed to copy to clipboard', error);
        }
      }}
    >
      <Copy className="h-4 w-4" />
    </Button>
  );
}