import { Languages } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { useI18n } from '@/shared/lib/i18n';
import { cn } from '@/shared/utils/cn';

export function LanguageSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { lang, setLang } = useI18n();

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-[var(--shadow-soft)]',
        className,
      )}
    >
      {!compact ? <Languages className="ml-1 h-4 w-4 text-muted-foreground" /> : null}

      <Button
        type="button"
        variant={lang === 'en' ? 'secondary' : 'ghost'}
        size="xs"
        className="h-7 px-2 text-[11px]"
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
      >
        EN
      </Button>

      <Button
        type="button"
        variant={lang === 'ru' ? 'secondary' : 'ghost'}
        size="xs"
        className="h-7 px-2 text-[11px]"
        onClick={() => setLang('ru')}
        aria-pressed={lang === 'ru'}
      >
        RU
      </Button>
    </div>
  );
}