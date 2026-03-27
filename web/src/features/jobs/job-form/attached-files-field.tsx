import { FileUp, Paperclip, Trash2 } from 'lucide-react';
import type { AttachedFile } from '@/api/types';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { formatFileSize } from '@/shared/utils/format';

export function AttachedFilesField({
  existingFiles,
  pendingFiles,
  onPickFiles,
  onRemoveExisting,
  onRemovePending,
}: {
  existingFiles: AttachedFile[];
  pendingFiles: File[];
  onPickFiles: (files: FileList | null) => void;
  onRemoveExisting: (fileId: string) => void;
  onRemovePending: (fileName: string) => void;
}) {
  const combinedItems = [
    ...existingFiles,
    ...pendingFiles.map((file) => ({
      id: file.name,
      filename: file.name,
      size_bytes: file.size,
      storage_key: '__pending__',
      mime_type: file.type || 'application/octet-stream',
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Attached files</h3>
          <p className="text-sm text-muted-foreground">
            Upload reference files that should be mounted into the job workspace.
          </p>
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-accent">
          <FileUp className="h-4 w-4" />
          Upload files
          <input
            className="hidden"
            type="file"
            multiple
            onChange={(event) => {
              onPickFiles(event.target.files);
              event.currentTarget.value = '';
            }}
          />
        </label>
      </div>

      <div className="space-y-3">
        {combinedItems.length === 0 ? (
          <Card className="border-dashed shadow-none">
            <CardContent className="p-6 text-sm text-muted-foreground">
              No files attached yet.
            </CardContent>
          </Card>
        ) : null}

        {existingFiles.map((file) => (
          <Card key={file.id} className="shadow-none">
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <Paperclip className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{file.filename}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size_bytes)}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRemoveExisting(file.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}

        {pendingFiles.map((file) => (
          <Card key={file.name} className="border-blue-200 bg-blue-50 shadow-none">
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                  <FileUp className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-blue-700/80">
                    Pending upload · {formatFileSize(file.size)}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRemovePending(file.name)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
