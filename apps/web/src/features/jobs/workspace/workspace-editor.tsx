import { Editor } from '@monaco-editor/react';
import { X, Save, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { Button } from '@/shared/components/ui/button';
import { useI18n } from '@/shared/lib/i18n';
import { OpenTab } from './use-workspace';

interface WorkspaceEditorProps {
  tabs: OpenTab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onContentChange: (id: string, content: string) => void;
  onSaveTab: (id: string) => void;
}

const getLanguage = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'py': return 'python';
    case 'js':
    case 'jsx': return 'javascript';
    case 'ts':
    case 'tsx': return 'typescript';
    case 'json':
    case 'jsonl': return 'json';
    case 'sh':
    case 'bash': return 'shell';
    case 'yaml':
    case 'yml': return 'yaml';
    case 'md': return 'markdown';
    case 'sql': return 'sql';
    case 'html': return 'html';
    case 'css': return 'css';
    default: return 'plaintext';
  }
};

export function WorkspaceEditor({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onContentChange,
  onSaveTab,
}: WorkspaceEditorProps) {
  const { t } = useI18n();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex h-full flex-col bg-muted/20">
      <div className="flex h-10 border-b border-border bg-muted/30 overflow-x-auto overflow-y-hidden no-scrollbar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              'group flex min-w-32 max-w-64 items-center gap-2 border-r border-border px-3 py-1.5 text-sm transition-colors cursor-pointer',
              tab.id === activeTabId
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:bg-muted/50'
            )}
            onClick={() => onSelectTab(tab.id)}
          >
            <span className="truncate flex-1">{tab.name}</span>
            {tab.isDirty && (
              <span className="h-2 w-2 rounded-full bg-primary" />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 rounded-sm opacity-0 group-hover:opacity-100 focus:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex-1 relative overflow-hidden bg-background">
        {activeTab ? (
          <div className="h-full flex flex-col">
             <div className="flex items-center justify-between px-4 py-2 bg-muted/10 border-b border-border/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-2">
                    {activeTab.path}
                    {activeTab.loading && <Loader2 className="h-3 w-3 animate-spin" />}
                </span>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="xs"
                        className="h-6"
                        onClick={() => onSaveTab(activeTab.id)}
                        disabled={!activeTab.isDirty}
                    >
                        <Save className="h-3 w-3 mr-1" />
                        {t.common.save}
                    </Button>
                </div>
            </div>
            <div className="flex-1">
                <Editor
                    height="100%"
                    language={getLanguage(activeTab.name)}
                    value={activeTab.content}
                    onChange={(val) => onContentChange(activeTab.id, val || '')}
                    theme="vs-dark"
                    options={{
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 13,
                        lineNumbers: 'on',
                        automaticLayout: true,
                        tabSize: 4,
                        wordWrap: 'on'
                    }}
                />
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-muted-foreground p-8">
            <div className="relative">
                <FileText className="h-24 w-24 opacity-5" />
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-4xl font-bold opacity-10">Forge</span>
                </div>
            </div>
            <div className="space-y-1">
                <p className="text-sm font-medium">No file open</p>
                <p className="text-xs opacity-60">Select a file from the explorer to edit</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
