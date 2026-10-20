import { useEffect, useState } from 'react';
import { useApiHealth } from '../../lib/useApiHealth';
import { Spinner } from '../ui/Spinner';

/** A health check this slow means the server is starting, not just a slow network. */
const SLOW_AFTER_MS = 2_500;

/**
 * Free hosting puts the API to sleep after 15 idle minutes, and the first request then takes
 * about a minute. Without this, the first visitor would just see buttons that don't respond.
 */
export function WakeNotice() {
  const { isPending, isError } = useApiHealth();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!isPending) return;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [isPending]);

  if (!isError && !(isPending && slow)) return null;

  return (
    <div role="status" className="border-b border-line bg-warn-soft">
      <div className="mx-auto flex w-full max-w-[1100px] items-start gap-3 px-4 py-3 text-[13px] sm:px-6">
        <Spinner className="mt-0.5 shrink-0 text-warn" />
        <p className="text-fg">
          <span className="font-medium">Waking up the server.</span>{' '}
          <span className="text-muted">
            It sleeps when nobody is using it and takes up to a minute to start. This message disappears when
            it&rsquo;s ready.
          </span>
        </p>
      </div>
    </div>
  );
}
