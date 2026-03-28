import type { PropsWithChildren } from 'react';
import { useState } from 'react';
import { Bell, Cpu, Menu, Search, Sparkles, X } from 'lucide-react';
import { Link, useLocation } from '@tanstack/react-router';
import { LanguageSwitcher } from '@/shared/components/app/language-switcher';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { cn } from '@/shared/utils/cn';

const navigation = [
  { to: '/', label: 'Dashboard' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/workers', label: 'Workers' },
  { to: '/catalog', label: 'Catalog' },
];

function NavLink({ to, label, onClick }: { to: string; label: string; onClick?: () => void }) {
  const location = useLocation();
  const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        'flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-all',
        active
          ? 'bg-primary text-primary-foreground shadow-[var(--shadow-soft)]'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {label}
    </Link>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <aside className="flex h-full flex-col gap-6 rounded-none border-r border-border bg-card/90 p-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[var(--shadow-soft)]">
          <Cpu className="h-5 w-5" />
        </div>
        <div>
          <p className="text-lg font-semibold tracking-tight">Cloud Forge</p>
          <p className="text-xs uppercase tracking-[0.28em] text-primary">Control plane</p>
        </div>
      </div>

      <nav className="space-y-2">
        {navigation.map((item) => (
          <NavLink key={item.to} to={item.to} label={item.label} onClick={onNavigate} />
        ))}
      </nav>

      <div className="mt-auto space-y-4">
        <LanguageSwitcher />

        <div className="rounded-2xl border border-border bg-muted/60 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Production-ready frontend
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            React 19 + TanStack Router/Query + Tailwind v4 + shadcn/ui primitives.
          </p>
        </div>
      </div>
    </aside>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-transparent text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {open ? (
          <div className="fixed inset-0 z-50 bg-slate-950/30 lg:hidden">
            <div className="h-full w-[280px] bg-card">
              <div className="flex items-center justify-end p-3">
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <Sidebar onNavigate={() => setOpen(false)} />
            </div>
          </div>
        ) : null}

        <div className="min-w-0">
          <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
            <div className="mx-auto flex h-18 max-w-7xl items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
              <Button
                variant="outline"
                size="icon"
                className="lg:hidden"
                onClick={() => setOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>

              <div className="relative hidden max-w-md flex-1 md:block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  readOnly
                  value=""
                  placeholder="Search jobs, runs, workers..."
                  className="h-11 rounded-2xl border-border bg-card pl-10"
                />
              </div>

              <div className="ml-auto flex items-center gap-3">
                <LanguageSwitcher className="hidden sm:inline-flex" compact />

                <div className="hidden rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground sm:block">
                  {import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}
                </div>

                <Button variant="outline" size="icon" className="rounded-full">
                  <Bell className="h-4 w-4" />
                </Button>

                <div className="flex items-center gap-3 rounded-full border border-border bg-card px-2.5 py-1.5 shadow-[var(--shadow-soft)]">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    CF
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-sm font-medium">Cloud Forge</p>
                    <p className="text-xs text-muted-foreground">Admin workspace</p>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}