// src/features/jobs/job-form/containers-field-array.tsx
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useWatch, type Control, type UseFormRegister, type UseFormSetValue } from 'react-hook-form';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import type { JobFormValues } from './job-form-schema';

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
      name: `container-${fields.length + 1}`,
      image: '',
      is_parent: fields.length === 0, // первый контейнер автоматически bootstrap
      env: [], // ← ОБЯЗАТЕЛЬНОЕ поле!
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

    // Если удалили bootstrap — делаем первым оставшийся контейнер bootstrap
    if (removingParent && containers.length > 1) {
      queueMicrotask(() => {
        const remaining = containers.filter((_, i) => i !== index);
        const nextContainers = remaining.map((c, i) => ({
          ...c,
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Containers</h3>
          <p className="text-sm text-muted-foreground">
            Настройте bootstrap-контейнер (должен быть только один) и дополнительные контейнеры.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={handleAppend}>
          <Plus className="h-4 w-4" />
          Add container
        </Button>
      </div>

      <div className="space-y-4">
        {fields.map((field, index) => {
          const isParent = containers[index]?.is_parent ?? false;

          const isLargeImage = containers[index]?.image?.includes('cloud-forge-worker-qwen-7b');

          return (
            <Card
              key={field.id}
              className={isParent ? 'border-primary/50 bg-primary/5 shadow-md' : ''}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="text-base flex items-center gap-2">
                  Container #{index + 1}
                  {isParent && (
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      BOOTSTRAP
                    </span>
                  )}
                </CardTitle>
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
                    <Input
                      id={`containers.${index}.name`}
                      placeholder="bootstrap"
                      {...register(`containers.${index}.name`)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`containers.${index}.image`}>Docker Image</Label>
                    <Input
                      id={`containers.${index}.image`}
                      placeholder="igortet/cloud-forge-worker-qwen-7b:0.1.0"
                      {...register(`containers.${index}.image`)}
                    />
                  </div>
                </div>

                {isLargeImage && (
                  <Alert variant="warning" className="bg-amber-50 border-amber-200 text-amber-900">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Большой образ модели</AlertTitle>
                    <AlertDescription className="text-xs">
                      Этот образ содержит веса модели (50GB+). Первый запуск может занять до 10-15 минут
                      из-за скачивания слоёв.
                    </AlertDescription>
                  </Alert>
                )}

                <label className="flex items-center gap-3 text-sm cursor-pointer">
                  <Checkbox
                    checked={isParent}
                    onChange={() => makeParent(index)}
                  />
                  Это основной bootstrap / parent контейнер
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>GPUs</Label>
                    <Input
                      placeholder="all"
                      {...register(`containers.${index}.resources.gpus`)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Shared memory (shm_size)</Label>
                    <Input
                      placeholder="16g"
                      {...register(`containers.${index}.resources.shm_size`)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Memory limit</Label>
                    <Input
                      placeholder="64g"
                      {...register(`containers.${index}.resources.memory_limit`)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CPU limit</Label>
                    <Input
                      placeholder="8"
                      {...register(`containers.${index}.resources.cpu_limit`)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}