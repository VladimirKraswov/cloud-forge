import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tokensApi } from '@/api/tokens';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/components/ui/alert-dialog';
import { Button } from '@/shared/components/ui/button';
import { getApiErrorMessage } from '@/shared/lib/api-error';

export function RevokeTokenButton({
  tokenId,
  jobId,
  disabled,
}: {
  tokenId: string;
  jobId: string;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => tokensApi.revoke(tokenId),
    onSuccess: () => {
      toast.success('Token revoked');
      queryClient.invalidateQueries({ queryKey: ['job', jobId, 'tokens'] });
      queryClient.invalidateQueries({ queryKey: ['share-token', tokenId] });
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" disabled={disabled || mutation.isPending}>
          Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke token?</AlertDialogTitle>
          <AlertDialogDescription>
            The token will stop being claimable by workers immediately.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep token</AlertDialogCancel>
          <AlertDialogAction disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Revoking…' : 'Revoke token'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
