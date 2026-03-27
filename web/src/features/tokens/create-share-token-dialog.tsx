import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { jobsApi } from '@/api/jobs';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { getApiErrorMessage } from '@/shared/lib/api-error';

function toIsoOrUndefined(value: string) {
  if (!value) return undefined;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function CreateShareTokenDialog({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [maxClaims, setMaxClaims] = useState('1');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () => {
      const expiresAtIso = toIsoOrUndefined(expiresAt);
      const maxClaimsValue = maxClaims ? Number(maxClaims) : undefined;

      return jobsApi.createShareToken(jobId, {
        ...(expiresAtIso ? { expires_at: expiresAtIso } : {}),
        ...(maxClaimsValue ? { max_claims: maxClaimsValue } : {}),
      });
    },
    onSuccess: () => {
      toast.success('Share token created');
      queryClient.invalidateQueries({ queryKey: ['job', jobId, 'tokens'] });
      setOpen(false);
      setExpiresAt('');
      setMaxClaims('1');
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create token</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create share token</DialogTitle>
          <DialogDescription>
            For a simple remote run on one Docker machine, the default single-use token is usually enough.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="expiresAt">Expires at</Label>
            <Input
              id="expiresAt"
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxClaims">Max claims</Label>
            <Input
              id="maxClaims"
              type="number"
              min={1}
              value={maxClaims}
              onChange={(event) => setMaxClaims(event.target.value)}
              placeholder="Unlimited if empty"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating…' : 'Create token'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}