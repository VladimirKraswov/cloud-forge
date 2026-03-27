import { ChangeEvent } from 'react';
import {
  FileCode2,
  FileText,
  FolderTree,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { cn } from '@/shared/utils/cn';
import { formatFileSize } from '@/shared/utils/format';

const TEXT_EXTENSIONS = new Set([
  'py',
  'js',
  'ts',
  'tsx',
  'jsx',
  'json',
  'yaml',
  'yml',
  'txt',
  'md',
  'sh',
  'toml',
  'env',
  'ini',
  'cfg',
  'csv',
  'xml',
  'html',
  'css',
  'sql',
]);

export type EditableJobFile = {
  local_id: string;
  existing_id?: string;
  original_relative_path?: string;
  relative_path: string;
  filename: string;
  source_type: 'inline' | 'upload';
  mime_type: string;
  is_executable: boolean;
  inline_content: string;
  file?: File | null;
  status: 'existing' | 'new' | 'deleted';
  content_loaded: boolean;
};

function getExtension(path: string) {
  const filename = path.split('/').pop() || path;
  const parts = filename.split('.');
  return parts.length > 1 ? parts.at(-1)?.toLowerCase() || '' : '';
}

export function isTextEditableFile(file: Pick<EditableJobFile, 'relative_path' | 'mime_type'>) {
  if (file.mime_type.startsWith('text/')) return true;
  if (file.mime_type === 'application/json') return true;
  return TEXT_EXTENSIONS.has(getExtension(file.relative_path));
}

function fileDepth(relativePath: string) {
  return relativePath.split('/').filter(Boolean).length - 1;
}

export function JobFilesEditor({
  files,
  selectedFileId,
  loadingContent,
  onSelectFile,
  onAddInlineFile,
  onPickUploadFiles,
  onUpdateFile,
  onDeleteFile,
}: {
  files: EditableJobFile[];
  selectedFileId?: string | null;
  loadingContent?: boolean;
  onSelectFile: (localId: string) => void;
  onAddInlineFile: () => void;
  onPickUploadFiles: (files: FileList | null) => void;
  onUpdateFile: (localId: string, patch: Partial<EditableJobFile>) => void;
  onDeleteFile: (localId: string) => void;
}) {
  const visibleFiles = files
    .filter((file) => file.status !== 'deleted')
    .sort((left, right) => left.relative_path.localeCompare(right.relative_path));

  const selectedFile =
    visibleFiles.find((file) => file.local_id === selectedFileId) || visibleFiles[0] || null;

  const editable = selectedFile ? isTextEditableFile(selectedFile) : false;

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Workspace files</CardTitle>
            <p className="text-sm text-muted-foreground">
              Keep your scripts, configs and datasets under relative paths like
              <span className="font-mono"> scripts/train.sh</span> or
              <span className="font-mono"> src/train.py</span>.
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onAddInlineFile}>
              <Plus className="h-4 w-4" />
              New inline file
            </Button>

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-accent">
              <Upload className="h-4 w-4" />
              Upload files
              <input
                className="hidden"
                type="file"
                multiple
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  onPickUploadFiles(event.target.files);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </div>

          <div className="max-h-[560px] space-y-1 overflow-y-auto rounded-2xl border border-border p-2">
            {visibleFiles.length === 0 ? (
              <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <FolderTree className="h-5 w-5" />
                Add at least one file to the job workspace.
              </div>
            ) : null}

            {visibleFiles.map((file) => {
              const selected = selectedFile?.local_id === file.local_id;
              const isText = isTextEditableFile(file);

              return (
                <button
                  key={file.local_id}
                  type="button"
                  onClick={() => onSelectFile(file.local_id)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition',
                    selected ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
                  )}
                  style={{ paddingLeft: `${12 + fileDepth(file.relative_path) * 14}px` }}
                >
                  <div className="mt-0.5">
                    {isText ? <FileCode2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{file.relative_path}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {file.source_type}
                      {file.file ? ` · ${formatFileSize(file.file.size)}` : ''}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">File inspector</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {!selectedFile ? (
            <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
              No file selected.
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-2">
                  <Label>Relative path</Label>
                  <Input
                    value={selectedFile.relative_path}
                    onChange={(event) =>
                      onUpdateFile(selectedFile.local_id, {
                        relative_path: event.target.value,
                        filename:
                          event.target.value.split('/').pop() || event.target.value,
                      })
                    }
                    placeholder="scripts/train.sh"
                  />
                </div>

                <div className="space-y-2">
                  <Label>MIME type</Label>
                  <Input
                    value={selectedFile.mime_type}
                    onChange={(event) =>
                      onUpdateFile(selectedFile.local_id, {
                        mime_type: event.target.value,
                      })
                    }
                    placeholder="text/x-shellscript"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <Checkbox
                    checked={selectedFile.is_executable}
                    onChange={(event) =>
                      onUpdateFile(selectedFile.local_id, {
                        is_executable: event.target.checked,
                      })
                    }
                  />
                  Mark as executable
                </label>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onDeleteFile(selectedFile.local_id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                  Remove file
                </Button>
              </div>

              {editable ? (
                <div className="space-y-2">
                  <Label>Content</Label>
                  <Textarea
                    className="min-h-[460px] font-mono text-sm"
                    value={selectedFile.inline_content}
                    onChange={(event) =>
                      onUpdateFile(selectedFile.local_id, {
                        source_type: 'inline',
                        inline_content: event.target.value,
                        content_loaded: true,
                      })
                    }
                    placeholder="Write code, shell script, config, or text content here."
                  />
                  {loadingContent ? (
                    <p className="text-xs text-muted-foreground">Loading file content…</p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                  This file looks binary or non-textual, so the inline editor is disabled.
                  You can still keep it in the workspace and reference its path from your
                  entrypoint script.
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
