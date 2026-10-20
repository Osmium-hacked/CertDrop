import type { BatchSummary, CertificateRow, CertificateStatus } from '@certdrop/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { AnimatedNumber } from '../../components/ui/AnimatedNumber';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Segmented';
import { Skeleton } from '../../components/ui/Skeleton';
import { Spinner } from '../../components/ui/Spinner';
import { StatusPill } from '../../components/ui/StatusPill';
import { ApiRequestError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useBatch, useCertificates, useRetryFailed, useRevocation } from './batchApi';

const BATCH_LABEL: Record<BatchSummary['status'], { label: string; className: string }> = {
  PROCESSING: { label: 'Sending', className: 'bg-info-soft text-info' },
  COMPLETED: { label: 'All sent', className: 'bg-ok-soft text-ok' },
  COMPLETED_WITH_ERRORS: { label: 'Finished with errors', className: 'bg-warn-soft text-warn' },
};

export function BatchProgress({ batchId, onStartOver }: { batchId: string; onStartOver: () => void }) {
  const { data, isPending } = useBatch(batchId);
  const retry = useRetryFailed(batchId);

  if (isPending || !data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { batch } = data;
  const { counts } = batch;
  const processing = batch.status === 'PROCESSING';
  const done = counts.sent + counts.failed;
  const generatedSoFar = counts.generated + counts.sent;
  const badge = BATCH_LABEL[batch.status];

  const onRetry = () =>
    retry.mutate(undefined, {
      onSuccess: ({ retried }) =>
        toast.success(`Retrying ${retried} ${retried === 1 ? 'certificate' : 'certificates'}`),
      onError: (err) =>
        toast.error(err instanceof ApiRequestError ? err.message : 'Couldn’t retry. Please try again.'),
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
              badge.className,
            )}
          >
            {processing ? (
              <Spinner className="size-3" />
            ) : (
              <span aria-hidden className="size-1.5 rounded-full bg-current" />
            )}
            {badge.label}
          </span>
          <span className="text-sm text-muted">{batch.eventName}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {counts.failed > 0 && !processing && (
            <Button size="sm" onClick={onRetry} disabled={retry.isPending}>
              {retry.isPending && <Spinner />}
              Retry {counts.failed} failed
            </Button>
          )}
          {generatedSoFar > 0 ? (
            <a
              href={`/api/batches/${batchId}/zip`}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-line-strong bg-elevated px-3 text-[13px] font-medium text-fg hover:bg-white/[0.06]"
            >
              Download all as ZIP
            </a>
          ) : (
            <Button size="sm" disabled>
              Download all as ZIP
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3" aria-live="polite">
        <Counter label="Generated" value={generatedSoFar} total={counts.total} />
        <Counter label="Sent" value={counts.sent} total={counts.total} tone="ok" />
        <Counter
          label="Failed"
          value={counts.failed}
          total={counts.total}
          tone={counts.failed ? 'danger' : undefined}
        />
      </div>

      <div
        role="progressbar"
        aria-label="Certificates processed"
        aria-valuemin={0}
        aria-valuemax={counts.total}
        aria-valuenow={done}
        className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
      >
        <div
          className="absolute inset-y-0 left-0 bg-accent/40 transition-[width] duration-500"
          style={{ width: `${(generatedSoFar / counts.total) * 100}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-500"
          style={{ width: `${(done / counts.total) * 100}%` }}
        />
      </div>

      <CertificateTable batchId={batchId} polling={processing} failedCount={counts.failed} />

      {!processing && (
        <div className="flex flex-col items-center gap-2 border-t border-line pt-6 text-center">
          <p className="text-sm text-muted">
            {counts.failed === 0
              ? 'Every participant has their certificate.'
              : 'Failed rows can be retried. Errors from the email provider are shown in the table.'}
          </p>
          <Button variant="ghost" size="sm" onClick={onStartOver}>
            Start another batch
          </Button>
        </div>
      )}
    </div>
  );
}

function Counter({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone?: 'ok' | 'danger';
}) {
  return (
    <div className="rounded-xl border border-line bg-elevated/60 px-4 py-3">
      <p className="text-[11px] tracking-[0.08em] text-muted uppercase">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold',
          tone === 'ok' && 'text-ok',
          tone === 'danger' && 'text-danger',
        )}
      >
        <AnimatedNumber value={value} />
        <span className="text-sm font-normal text-muted"> / {total.toLocaleString()}</span>
      </p>
    </div>
  );
}

function CertificateTable({
  batchId,
  polling,
  failedCount,
}: {
  batchId: string;
  polling: boolean;
  failedCount: number;
}) {
  const [filter, setFilter] = useState<'all' | 'FAILED'>('all');
  const status: CertificateStatus | undefined = filter === 'FAILED' ? 'FAILED' : undefined;
  const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } = useCertificates(
    batchId,
    status,
    polling,
  );
  const rows = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-3">
      <div className="w-full sm:w-64">
        <Segmented
          label="Show"
          hideLabel
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'FAILED', label: `Failed (${failedCount})` },
          ]}
        />
      </div>

      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
          {filter === 'FAILED' ? 'Nothing has failed.' : 'No certificates yet.'}
        </p>
      ) : (
        <div className="max-h-[440px] overflow-auto rounded-xl border border-line">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <caption className="sr-only">Certificate status for each participant</caption>
            <thead className="sticky top-0 z-10 bg-elevated text-[11px] tracking-[0.06em] text-muted uppercase">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Name
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Email
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Certificate
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={row.id} batchId={batchId} row={row} />
              ))}
            </tbody>
          </table>
          {hasNextPage && (
            <div className="border-t border-line p-2 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage && <Spinner />}
                Show more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ batchId, row }: { batchId: string; row: CertificateRow }) {
  const issued = row.status === 'GENERATED' || row.status === 'SENT';
  const revocation = useRevocation(batchId);
  const revoked = row.revokedAt !== null;

  const toggleRevoked = () => {
    const action = revoked ? 'restore' : 'revoke';
    // A native confirm: accessible, keyboard-friendly, and hard to trigger by accident.
    if (
      action === 'revoke' &&
      !window.confirm(
        `Revoke ${row.recipientName}’s certificate? Its verification page will say it is no longer valid. You can restore it later.`,
      )
    ) {
      return;
    }
    revocation.mutate(
      { certId: row.id, action },
      {
        onSuccess: () => toast.success(action === 'revoke' ? 'Certificate revoked' : 'Certificate restored'),
        onError: (err) =>
          toast.error(err instanceof ApiRequestError ? err.message : 'Couldn’t update the certificate.'),
      },
    );
  };

  return (
    <tr className={cn('border-t border-line align-top', row.status === 'FAILED' && 'bg-danger-soft/60')}>
      <td className="px-3 py-2 text-fg">{row.recipientName}</td>
      <td className="px-3 py-2 text-muted">{row.recipientEmail}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill status={row.status} />
          {revoked && (
            <span className="inline-flex rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
              Revoked
            </span>
          )}
        </div>
        {row.error && <p className="mt-1 max-w-xs text-[12px] text-danger">{row.error}</p>}
      </td>
      <td className="px-3 py-2">
        {issued ? (
          <div className="flex items-center gap-3">
            <a
              href={`/api/batches/${batchId}/certificates/${row.id}/download`}
              className="rounded-sm font-mono text-[12px] text-accent-fg hover:underline"
              title="Download PDF"
            >
              {row.id}
            </a>
            <a
              href={`/verify/${row.id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-sm text-[12px] text-muted hover:text-fg"
            >
              Verify page
            </a>
            <button
              type="button"
              onClick={toggleRevoked}
              disabled={revocation.isPending}
              className="rounded-sm text-[12px] text-muted hover:text-fg disabled:opacity-50"
            >
              {revoked ? 'Restore' : 'Revoke'}
              <span className="sr-only"> {row.recipientName}’s certificate</span>
            </button>
          </div>
        ) : (
          <span className="font-mono text-[12px] text-muted">{row.id}</span>
        )}
      </td>
    </tr>
  );
}
