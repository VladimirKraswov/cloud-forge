import { CopyButton } from '@/shared/components/app/copy-button';

export function CodeBlock({ code, language, className = '' }: { code: string; language?: string; className?: string; }) {
  return (
    <div className={`overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-3">
        <div className="text-xs uppercase tracking-[0.24em] text-slate-400">{language || 'code'}</div>
        <CopyButton value={code} label="Code copied" />
      </div>
      <pre className="custom-scrollbar overflow-x-auto p-4 text-sm leading-6 text-slate-200"><code>{code}</code></pre>
    </div>
  );
}
