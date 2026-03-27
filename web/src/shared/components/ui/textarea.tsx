import * as React from 'react';
import { cn } from '@/shared/utils/cn';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(({ className, ...props }, ref) => {
  return <textarea ref={ref} className={cn('min-h-[110px] w-full rounded-xl border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)} {...props} />;
});

Textarea.displayName = 'Textarea';
