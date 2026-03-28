import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import type { JobFormValues } from '@/features/jobs/job-form/job-form-schema';

export function EnvironmentsFieldArray({
  control,
  register,
}: {
  control: Control<JobFormValues>;
  register: UseFormRegister<JobFormValues>;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'environment_variables',
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Environment variables</h3>
          <p className="text-sm text-muted-foreground">
            These variables are injected into the remote worker before the entrypoint starts.
          </p>
        </div>

        <Button type="button" variant="outline" onClick={() => append({ key: '', value: '' })}>
          <Plus className="h-4 w-4" />
          Add variable
        </Button>
      </div>

      <div className="space-y-3">
        {fields.length === 0 ? (
          <Card className="border-dashed shadow-none">
            <CardContent className="p-6 text-sm text-muted-foreground">
              No environment variables configured yet.
            </CardContent>
          </Card>
        ) : null}

        {fields.map((field, index) => (
          <Card key={field.id} className="shadow-none">
            <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <div className="space-y-2">
                <Label htmlFor={`environment_variables.${index}.key`}>Key</Label>
                <Input
                  id={`environment_variables.${index}.key`}
                  {...register(`environment_variables.${index}.key`)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`environment_variables.${index}.value`}>Value</Label>
                <Input
                  id={`environment_variables.${index}.value`}
                  {...register(`environment_variables.${index}.value`)}
                />
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="md:mb-0.5"
                onClick={() => remove(index)}
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