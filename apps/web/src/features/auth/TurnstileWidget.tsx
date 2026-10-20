import type { TurnstileState } from './useTurnstile';

type Props = Pick<TurnstileState, 'enabled' | 'failed' | 'mount'>;

/** Cloudflare's widget, plus a hint if its script was blocked. Renders nothing without a site key. */
export function TurnstileWidget({ enabled, failed, mount }: Props) {
  if (!enabled) return null;
  return (
    <div className="mt-4 max-w-sm">
      <div ref={mount} className="min-h-[65px]" />
      {failed && (
        <p className="mt-1 text-[13px] text-danger">
          The human check couldn’t load. Disable blockers for challenges.cloudflare.com and reload.
        </p>
      )}
    </div>
  );
}
