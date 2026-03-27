import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, KeyRound, PlayCircle, Terminal } from 'lucide-react';
import { jobsApi } from '@/api/jobs';
import { tokensApi } from '@/api/tokens';
import { CreateShareTokenDialog } from '@/features/tokens/create-share-token-dialog';
import { RevokeTokenButton } from '@/features/tokens/revoke-token-button';
import { CopyButton } from '@/shared/components/app/copy-button';
import { EmptyState } from '@/shared/components/app/empty-state';
import { PageHeader } from '@/shared/components/app/page-header';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { formatDateTime, formatRelative } from '@/shared/utils/format';

export function JobTokensPage() {
  const { jobId } = useParams({ from: '/jobs/$jobId/tokens' });
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);

  const tokensQuery = useQuery({
    queryKey: ['job', jobId, 'tokens'],
    queryFn: () => jobsApi.listShareTokens(jobId),
  });

  const tokenDetailsQuery = useQuery({
    queryKey: ['share-token', selectedTokenId],
    queryFn: () => tokensApi.get(selectedTokenId!),
    enabled: Boolean(selectedTokenId),
  });

  const dockerCommand =
    tokenDetailsQuery.data?.docker_command || tokenDetailsQuery.data?.worker_command || '';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Share tokens"
        title="Remote execution tokens"
        description="Create a token, copy the generated docker command, and run this job on any machine with Docker."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/jobs/$jobId" params={{ jobId }}>
                <ArrowLeft className="h-4 w-4" />
                Job details
              </Link>
            </Button>
            <CreateShareTokenDialog jobId={jobId} />
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlayCircle className="h-4 w-4" />
            Remote run quick start
          </CardTitle>
          <CardDescription>
            1) create a token, 2) open token details, 3) copy the docker command, 4) run it on any computer that has Docker access to this control plane.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="p-0">
          {tokensQuery.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Claims</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last claimed</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokensQuery.data.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left font-medium hover:text-primary"
                        onClick={() => setSelectedTokenId(token.id)}
                      >
                        {token.id}
                      </button>
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {token.claim_count}
                      {token.max_claims ? ` / ${token.max_claims}` : ' / unlimited'}
                      {typeof token.remaining_claims === 'number'
                        ? ` · ${token.remaining_claims} left`
                        : ''}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(token.created_at)}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {token.last_claimed_at ? formatRelative(token.last_claimed_at) : 'Never'}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {token.expires_at ? formatDateTime(token.expires_at) : 'Never'}
                    </TableCell>

                    <TableCell>
                      <div className="flex justify-end">
                        <RevokeTokenButton tokenId={token.id} jobId={jobId} disabled={token.revoked} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-6">
              <EmptyState
                icon={KeyRound}
                title="No tokens yet"
                description="Create a token to generate the docker command for a remote worker machine."
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedTokenId)} onOpenChange={(open) => !open && setSelectedTokenId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Token details</DialogTitle>
            <DialogDescription>
              Copy this docker command and run it on any computer with Docker. The worker container will claim the job and execute it remotely.
            </DialogDescription>
          </DialogHeader>

          {tokenDetailsQuery.data ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-border bg-muted/50 p-4">
                <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                  Token value
                </div>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all text-sm">{tokenDetailsQuery.data.token}</code>
                  <CopyButton value={tokenDetailsQuery.data.token} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card className="shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">Metadata</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>Created: {formatDateTime(tokenDetailsQuery.data.created_at)}</div>
                    <div>
                      Expires:{' '}
                      {tokenDetailsQuery.data.expires_at
                        ? formatDateTime(tokenDetailsQuery.data.expires_at)
                        : 'Never'}
                    </div>
                    <div>Claims: {tokenDetailsQuery.data.claim_count}</div>
                    <div>
                      Remaining:{' '}
                      {typeof tokenDetailsQuery.data.remaining_claims === 'number'
                        ? tokenDetailsQuery.data.remaining_claims
                        : 'Unlimited'}
                    </div>
                    <div>Docker image: {tokenDetailsQuery.data.docker_image || '—'}</div>
                  </CardContent>
                </Card>

                <Card className="shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">Links</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {tokenDetailsQuery.data.share_url ? (
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          Share URL
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="min-w-0 flex-1 break-all text-xs">
                            {tokenDetailsQuery.data.share_url}
                          </code>
                          <CopyButton value={tokenDetailsQuery.data.share_url} />
                        </div>
                      </div>
                    ) : null}

                    {tokenDetailsQuery.data.claim_url ? (
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          Claim URL
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="min-w-0 flex-1 break-all text-xs">
                            {tokenDetailsQuery.data.claim_url}
                          </code>
                          <CopyButton value={tokenDetailsQuery.data.claim_url} />
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>

              <Card className="shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Terminal className="h-4 w-4" />
                    Docker command
                  </CardTitle>
                  <CardDescription>
                    Run this on the remote machine. Docker will pull the published bootstrap image automatically if needed.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {dockerCommand ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-slate-200">
                      <div className="mb-3 flex items-center justify-end">
                        <CopyButton value={dockerCommand} />
                      </div>
                      <code className="block whitespace-pre-wrap break-all text-sm">{dockerCommand}</code>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      No generated command returned by the backend for this token.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
