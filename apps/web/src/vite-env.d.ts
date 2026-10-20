/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Cloudflare Turnstile site key. Unset = no human check (local development without keys). */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
