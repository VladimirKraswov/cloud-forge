import { Card, CardContent } from '@/shared/components/ui/card';

export function ContainersFieldArray() {
  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="p-6 text-sm text-muted-foreground">
        Containers are now defined by the selected bootstrap image. Jobs no longer
        embed per-job container lists in the frontend form.
      </CardContent>
    </Card>
  );
}
