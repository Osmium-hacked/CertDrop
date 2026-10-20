import type { CertificateStatus } from '@certdrop/shared';
import { cn } from '../../lib/cn';

const styles: Record<CertificateStatus, { label: string; className: string }> = {
  QUEUED: { label: 'Queued', className: 'bg-white/[0.05] text-muted' },
  GENERATED: { label: 'Generated', className: 'bg-info-soft text-info' },
  SENT: { label: 'Sent', className: 'bg-ok-soft text-ok' },
  FAILED: { label: 'Failed', className: 'bg-danger-soft text-danger' },
};

export function StatusPill({ status }: { status: CertificateStatus }) {
  const { label, className } = styles[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
