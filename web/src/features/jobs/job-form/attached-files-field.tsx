import { Card, CardContent } from '@/shared/components/ui/card';

export function AttachedFilesField() {
  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="p-6 text-sm text-muted-foreground">
        Attached files were replaced by the workspace file editor. Use the
        <span className="mx-1 font-medium">Workspace files</span>
        tab in the new job builder.
      </CardContent>
    </Card>
  );
}
