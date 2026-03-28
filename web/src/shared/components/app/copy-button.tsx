import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';

export function CopyButton({
  value,
  label = 'Copied to clipboard',
}: {
  value: string;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success(label);
        } catch (error) {
          console.error('Failed to copy to clipboard', error);
          toast.error('Failed to copy to clipboard');
        }
      }}
    >
      <Copy className="h-4 w-4" />
    </Button>
  );
}