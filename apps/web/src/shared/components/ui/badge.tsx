import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/shared/utils/cn';

const badgeVariants = cva('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize', {
  variants: {
    variant: {
      default: 'border-transparent bg-primary text-primary-foreground',
      secondary: 'border-transparent bg-secondary text-secondary-foreground',
      outline: 'border-border bg-card text-foreground',
      destructive: 'border-transparent bg-destructive text-destructive-foreground',
    },
  },
  defaultVariants: {
    variant: 'outline',
  },
});

export interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
