import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useWatch, type Control, type UseFormRegister, type UseFormSetValue } from 'react-hook-form';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import type { JobFormValues } from '@/features/jobs/job-form/job-form-schema';
import { Checkbox } from '@/shared/components/ui/checkbox';

export function ContainersFieldArray({
  control,
  register,
  setValue,
}: {
  control: Control<JobFormValues>;
  register: UseFormRegister<JobFormValues>;
  setValue: UseFormSetValue<JobFormValues>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: 'containers' });
  const containers = useWatch({ control, name: 'containers' }) ?? [];

  const makeParent = (targetIndex: number) => {
    const next = containers.map((container, index) => ({
      ...container,
      is_parent: index === targetIndex,
    }));

    setValue('containers', next, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const handleAppend = () => {
    append({
      name: '',
      image: '',
      is_parent: fields.length === 0,
      env: [],
      resources: {
        cpu_limit: '',
        memory_limit: '',
        gpus: '',
        shm_size: '',
      },
    });
  };

  const handleRemove = (index: number) => {
    const removingParent = containers[index]?.is_parent;
    remove(index);

    const nextLength = fields.length - 1;
    if (nextLength <= 0) {
      return;
    }

    if (removingParent) {
      queueMicrotask(() => {
        const nextContainers = (containers.filter((_, i) => i !== index) ?? []).map((container, i) => ({
          ...container,
          is_parent: i === 0,
        }));

        setValue('containers', nextContainers, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Containers</h3>
          <p className="text-sm text-muted-foreground">
            Configure the bootstrap container and any sidecars required by the job.
          </p>
        </div>

        <Button type="button" variant="outline" onClick={handleAppend}>
          <Plus className="h-4 w-4" />
          Add container
        </Button>
      </div>

      <div className="space-y-4">
        {fields.map((field, index) => (
          <Card key={field.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="text-base">Container #{index + 1}</CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemove(index)}
                disabled={fields.length === 1}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`containers.${index}.name`}>Name</Label>
                  <Input id={`containers.${index}.name`} {...register(`containers.${index}.name`)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`containers.${index}.image`}>Docker image</Label>
                  <Input id={`containers.${index}.image`} {...register(`containers.${index}.image`)} />
                </div>
              </div>

              <label className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={Boolean(containers[index]?.is_parent)}
                  onChange={() => makeParent(index)}
                />
                Bootstrap / parent container
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`containers.${index}.resources.cpu_limit`}>CPU limit</Label>
                  <Input
                    id={`containers.${index}.resources.cpu_limit`}
                    placeholder="e.g. 2"
                    {...register(`containers.${index}.resources.cpu_limit`)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`containers.${index}.resources.memory_limit`}>Memory limit</Label>
                  <Input
                    id={`containers.${index}.resources.memory_limit`}
                    placeholder="e.g. 4g"
                    {...register(`containers.${index}.resources.memory_limit`)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`containers.${index}.resources.gpus`}>GPUs</Label>
                  <Input
                    id={`containers.${index}.resources.gpus`}
                    placeholder="e.g. all"
                    {...register(`containers.${index}.resources.gpus`)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`containers.${index}.resources.shm_size`}>Shared memory</Label>
                  <Input
                    id={`containers.${index}.resources.shm_size`}
                    placeholder="e.g. 1g"
                    {...register(`containers.${index}.resources.shm_size`)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}