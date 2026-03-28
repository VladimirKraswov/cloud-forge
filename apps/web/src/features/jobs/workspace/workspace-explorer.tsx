import { useState, useRef, useEffect } from 'react';
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
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

interface WorkspaceExplorerProps {
  tree: JobFileTreeNode[];
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onOpenFile: (node: JobFileTreeNode) => void;
  onMkdir: (path: string) => void;
  onCreateFile: (path: string) => void;
  onRename: (oldPath: string, newPath: string) => void;
  onMove: (oldPath: string, newPath: string) => void;
  onDelete: (path: string) => void;
  onDownload: (path: string) => void;
  onUpload: (files: File[]) => void;
  activePath?: string | null;
}

const ItemType = {
  NODE: 'node',
};

interface DragItem {
  path: string;
  type: 'file' | 'directory';
}

export function WorkspaceExplorer({
  tree,
  expandedPaths,
  onToggleExpand,
  onOpenFile,
  onMkdir,
  onCreateFile,
  onRename,
  onMove,
  onDelete,
  onDownload,
  onUpload,
  activePath,
}: WorkspaceExplorerProps) {
  const { t } = useI18n();

  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleStartRename = (node: JobFileTreeNode) => {
    setRenamingPath(node.path);
    setRenameValue(node.name);
  };

  const handleConfirmRename = (node: JobFileTreeNode) => {
    if (renamingPath !== node.path) return;
    if (renameValue && renameValue !== node.name) {
      const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
      const newPath = parentPath ? `${parentPath}/${renameValue}` : renameValue;
      onRename(node.path, newPath);
    }
    setRenamingPath(null);
  };

  const NodeItem = ({ node, depth }: { node: JobFileTreeNode; depth: number }) => {
    const isExpanded = expandedPaths.has(node.path);
    const isActive = activePath === node.path;
    const isRenaming = renamingPath === node.path;

    const [{ isDragging }, drag] = useDrag({
      type: ItemType.NODE,
      item: { path: node.path, type: node.type },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    });

    const [{ isOver, canDrop }, drop] = useDrop({
      accept: ItemType.NODE,
      canDrop: (item: DragItem) => {
        if (item.path === node.path) return false;
        if (node.type !== 'directory') return false;
        if (node.path.startsWith(item.path + '/')) return false;
        return true;
      },
      drop: (item: DragItem) => {
        const fileName = item.path.split('/').pop();
        const newPath = `${node.path}/${fileName}`;
        onMove(item.path, newPath);
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }),
        canDrop: monitor.canDrop(),
      }),
    });

    const itemRef = useRef<HTMLDivElement>(null);
    drag(itemRef);
    drop(itemRef);

    return (
      <div key={node.path} ref={itemRef} className={cn(isDragging && 'opacity-50')}>
        <div
          className={cn(
            'group flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent/50 cursor-pointer',
            isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
            isOver && canDrop && 'bg-primary/20 ring-1 ring-primary'
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => {
            if (node.type === 'directory') {
              onToggleExpand(node.path);
            } else {
              onOpenFile(node);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            const trigger = e.currentTarget.querySelector('[data-menu-trigger]') as HTMLElement;
            if (trigger) trigger.click();
          }}
        >
          <FileIcon
            name={node.name}
            isDirectory={node.type === 'directory'}
            isOpen={isExpanded}
            className="h-4 w-4 shrink-0"
          />

          {isRenaming ? (
            <input
              autoFocus
              className="flex-1 bg-background text-foreground border-none outline-none ring-1 ring-primary rounded px-1 h-5 text-sm"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmRename(node);
                if (e.key === 'Escape') {
                    setRenamingPath(null);
                    e.stopPropagation();
                }
              }}
              onBlur={() => handleConfirmRename(node)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate flex-1">{node.name}</span>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-menu-trigger
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
                      if (name) onCreateFile(`${node.path}/${name}`);
                    }}
                  >
                    <FilePlus className="mr-2 h-4 w-4" />
                    <span>New File</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      const name = window.prompt('New Folder');
                      if (name) onMkdir(`${node.path}/${name}`);
                    }}
                  >
                    <FolderPlus className="mr-2 h-4 w-4" />
                    <span>New Folder</span>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartRename(node);
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
            {node.children.map((child) => <NodeItem key={child.path} node={child} depth={depth + 1} />)}
          </div>
        )}
      </div>
    );
  };

  const [{ isOverRoot }, dropRoot] = useDrop({
    accept: ItemType.NODE,
    drop: (item: DragItem) => {
      const fileName = item.path.split('/').pop();
      onMove(item.path, fileName!);
    },
    collect: (monitor) => ({
      isOverRoot: monitor.isOver({ shallow: true }),
    }),
  });

  const rootDropRef = useRef<HTMLDivElement>(null);
  dropRoot(rootDropRef);

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
              if (name) onCreateFile(name);
            }}
          >
            <FilePlus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="New Folder"
            onClick={() => {
              const name = window.prompt('New Folder');
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
      <div
        ref={rootDropRef}
        className={cn("flex-1 overflow-auto p-2", isOverRoot && "bg-primary/5")}
      >
        {tree.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground p-4">
            <FilePlus className="h-8 w-8 opacity-20" />
            <p>No files yet</p>
          </div>
        ) : (
          tree.map((node) => <NodeItem key={node.path} node={node} depth={0} />)
        )}
      </div>
    </div>
  );
}
