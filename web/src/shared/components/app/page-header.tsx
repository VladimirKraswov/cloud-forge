import type { PropsWithChildren, ReactNode } from 'react';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; }) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-2">
        {eyebrow ? <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">{eyebrow}</div> : null}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function HeaderActions({ children }: PropsWithChildren) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
