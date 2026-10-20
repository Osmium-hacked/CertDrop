import { Link } from 'react-router';
import { cn } from '../../lib/cn';
import { useApiHealth } from '../../lib/useApiHealth';

function ApiStatus() {
  const { data, isPending, isError } = useApiHealth();

  const state = isPending ? 'pending' : isError ? 'down' : data.status;
  const label = {
    pending: 'Checking status…',
    ok: 'All systems normal',
    degraded: 'Degraded service',
    down: 'API unreachable',
  }[state];

  return (
    <span className="flex items-center gap-2" role="status">
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          state === 'ok' && 'bg-ok',
          state === 'degraded' && 'bg-warn',
          state === 'down' && 'bg-danger',
          state === 'pending' && 'bg-muted',
        )}
      />
      {label}
    </span>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 py-8 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="max-w-md">
          Templates and generated PDFs are deleted after 30 days. Certificate records are kept so verification
          links keep working.
        </p>
        <nav aria-label="Footer" className="flex items-center gap-5">
          <Link to="/verify" className="rounded-sm transition-colors hover:text-fg">
            Verify a certificate
          </Link>
          <ApiStatus />
        </nav>
      </div>
    </footer>
  );
}
