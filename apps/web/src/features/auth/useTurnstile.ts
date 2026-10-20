import { useCallback, useEffect, useRef, useState } from 'react';

interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptLoading: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's script once, only on the screen that needs it. */
function loadTurnstile(): Promise<TurnstileApi> {
  scriptLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile missing'));
    script.onerror = () => {
      scriptLoading = null;
      reject(new Error('Turnstile failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptLoading;
}

export interface TurnstileState {
  /** False when no site key is configured: the request goes ahead without a token. */
  enabled: boolean;
  token: string | null;
  /** Tokens are single-use: call after every request that consumed one. */
  reset: () => void;
  /** Callback ref for the element TurnstileWidget renders Cloudflare's iframe into. */
  mount: (element: HTMLDivElement | null) => void;
  /** Cloudflare's script couldn't load (blocked or offline). */
  failed: boolean;
}

/**
 * Cloudflare Turnstile: usually invisible to people (no puzzles), but stops scripts from
 * requesting codes and using CertDrop to email strangers.
 */
export function useTurnstile(): TurnstileState {
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // A callback ref in state (not a ref object) so the effect re-runs once the element exists.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY || !container) return;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled) return;
        widgetId.current = api.render(container, {
          sitekey: SITE_KEY,
          theme: 'dark',
          size: 'flexible',
          callback: (value: string) => setToken(value),
          'expired-callback': () => setToken(null),
          'error-callback': () => setToken(null),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [container]);

  const reset = useCallback(() => {
    setToken(null);
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }, []);

  return { enabled: Boolean(SITE_KEY), token, reset, mount: setContainer, failed };
}
