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
import { useI18n } from '@/shared/lib/i18n';
import { formatDateTime, formatRelative } from '@/shared/utils/format';

export function JobTokensPage() {
  const { t } = useI18n();
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
        eyebrow={t.jobs.tokens.title}
        title={t.jobs.tokens.remoteExecution}
        description={t.jobs.tokens.remoteExecutionDesc}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/jobs/$jobId" params={{ jobId }}>
                <ArrowLeft className="h-4 w-4" />
                {t.navigation.backToJobs}
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
            {t.jobs.tokens.quickStart}
          </CardTitle>
          <CardDescription>{t.jobs.tokens.quickStartDesc}</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="p-0">
          {tokensQuery.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.jobs.tokens.table.token}</TableHead>
                  <TableHead>{t.jobs.tokens.table.claims}</TableHead>
                  <TableHead>{t.jobs.tokens.table.created}</TableHead>
                  <TableHead>{t.jobs.tokens.table.lastClaimed}</TableHead>
                  <TableHead>{t.jobs.tokens.table.expires}</TableHead>
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
                      {token.max_claims ? ` / ${token.max_claims}` : ` / ${t.jobs.tokens.unlimited}`}
                      {typeof token.remaining_claims === 'number'
                        ? ` · ${token.remaining_claims} ${t.jobs.tokens.left}`
                        : ''}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(token.created_at)}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {token.last_claimed_at ? formatRelative(token.last_claimed_at) : t.common.never}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {token.expires_at ? formatDateTime(token.expires_at) : t.common.never}
                    </TableCell>

                    <TableCell>
                      <div className="flex justify-end">
                        <RevokeTokenButton
                          tokenId={token.id}
                          jobId={jobId}
                          disabled={token.revoked}
                        />
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
                title={t.jobs.tokens.noTokens}
                description={t.jobs.tokens.noTokensDesc}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedTokenId)}
        onOpenChange={(open) => !open && setSelectedTokenId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.jobs.tokens.details.title}</DialogTitle>
            <DialogDescription>{t.jobs.tokens.details.description}</DialogDescription>
          </DialogHeader>

          {tokenDetailsQuery.data ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-border bg-muted/50 p-4">
                <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                  {t.jobs.tokens.details.tokenValue}
                </div>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all text-sm">
                    {tokenDetailsQuery.data.token}
                  </code>
                  <CopyButton value={tokenDetailsQuery.data.token} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card className="shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">{t.jobs.tokens.details.metadata}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>
                      {t.common.created}: {formatDateTime(tokenDetailsQuery.data.created_at)}
                    </div>
                    <div>
                      {t.common.expires}:{' '}
                      {tokenDetailsQuery.data.expires_at
                        ? formatDateTime(tokenDetailsQuery.data.expires_at)
                        : t.common.never}
                    </div>
                    <div>
                      {t.jobs.tokens.table.claims}: {tokenDetailsQuery.data.claim_count}
                    </div>
                    <div>
                      {t.common.remaining}:{' '}
                      {typeof tokenDetailsQuery.data.remaining_claims === 'number'
                        ? tokenDetailsQuery.data.remaining_claims
                        : t.jobs.tokens.unlimited}
                    </div>
                    <div>
                      {t.jobs.tokens.details.dockerImage}:{' '}
                      {tokenDetailsQuery.data.docker_image || '—'}
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">{t.jobs.tokens.details.links}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {tokenDetailsQuery.data.share_url ? (
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          {t.jobs.tokens.details.shareUrl}
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
                          {t.jobs.tokens.details.claimUrl}
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
                    {t.jobs.tokens.details.dockerCommand}
                  </CardTitle>
                  <CardDescription>{t.jobs.tokens.details.dockerCommandDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                  {dockerCommand ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-slate-200">
                      <div className="mb-3 flex items-center justify-end">
                        <CopyButton value={dockerCommand} />
                      </div>
                      <code className="block whitespace-pre-wrap break-all text-sm">
                        {dockerCommand}
                      </code>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {t.jobs.tokens.details.noCommand}
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
