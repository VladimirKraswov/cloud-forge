import { useState } from 'react';
import {
  MoreVertical,
  Plus,
  FolderPlus,
  FilePlus,
  Trash2,
  Download,
  Upload,
  Pencil
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { useI18n } from '@/shared/lib/i18n';
import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { JobFileTreeNode } from '@/api/types';
import { FileIcon } from './file-icon';

interface WorkspaceExplorerProps {
  tree: JobFileTreeNode[];
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onOpenFile: (node: JobFileTreeNode) => void;
  onMkdir: (path: string) => void;
  onRename: (oldPath: string, newPath: string) => void;
  onDelete: (path: string) => void;
  onDownload: (path: string) => void;
  onUpload: (files: File[]) => void;
  activePath?: string | null;
}

export function WorkspaceExplorer({
  tree,
  expandedPaths,
  onToggleExpand,
  onOpenFile,
  onMkdir,
  onRename,
  onDelete,
  onDownload,
  onUpload,
  activePath,
}: WorkspaceExplorerProps) {
  const { t } = useI18n();

  const renderNode = (node: JobFileTreeNode, depth = 0) => {
    const isExpanded = expandedPaths.has(node.path);
    const isActive = activePath === node.path;

    return (
      <div key={node.path}>
        <div
          className={cn(
            'group flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent/50 cursor-pointer',
            isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => {
            if (node.type === 'directory') {
              onToggleExpand(node.path);
            } else {
              onOpenFile(node);
            }
          }}
        >
          <FileIcon
            name={node.name}
            isDirectory={node.type === 'directory'}
            isOpen={isExpanded}
            className="h-4 w-4 shrink-0"
          />
          <span className="truncate flex-1">{node.name}</span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {node.type === 'directory' && (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      const name = window.prompt(t.forms.files.newInline);
                      if (name) onMkdir(`${node.path}/${name}`);
                    }}
                  >
                    <FolderPlus className="mr-2 h-4 w-4" />
                    <span>{t.forms.files.newInline}</span>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  const newName = window.prompt(t.forms.files.path, node.name);
                  if (newName && newName !== node.name) {
                    const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
                    const newPath = parentPath ? `${parentPath}/${newName}` : newName;
                    onRename(node.path, newPath);
                  }
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                <span>Rename</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload(node.path);
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                <span>Download</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(t.common.delete + '?')) {
                    onDelete(node.path);
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                <span>{t.common.delete}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {node.type === 'directory' && isExpanded && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={t.forms.files.newInline}
            onClick={() => {
              const name = window.prompt(t.forms.files.newInline);
              if (name) onMkdir(name);
            }}
          >
            <FolderPlus className="h-4 w-4" />
          </Button>
          <label className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground transition-colors">
            <Upload className="h-4 w-4" />
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) onUpload(Array.from(e.target.files));
              }}
            />
          </label>
           <label className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground transition-colors" title="Upload Folder">
            <Plus className="h-4 w-4" />
            <input
              type="file"
              multiple
              // @ts-ignore
              webkitdirectory=""
              className="hidden"
              onChange={(e) => {
                if (e.target.files) onUpload(Array.from(e.target.files));
              }}
            />
          </label>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {tree.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground p-4">
            <FilePlus className="h-8 w-8 opacity-20" />
            <p>No files yet</p>
          </div>
        ) : (
          tree.map((node) => renderNode(node))
        )}
      </div>
    </div>
  );
}
