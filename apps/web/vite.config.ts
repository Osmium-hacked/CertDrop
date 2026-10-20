import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/**
 * `vite preview` serves the production build with the same security headers Vercel sends
 * (read from vercel.json), so CSP mistakes show up locally rather than after deploying. The only
 * difference: uploads go to the local RustFS container instead of R2.
 */
function productionHeaders(): Record<string, string> {
  const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
    headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  };
  const all = vercel.headers.find((rule) => rule.source === '/(.*)')?.headers ?? [];
  return Object.fromEntries(
    all.map(({ key, value }) => [
      key,
      key === 'Content-Security-Policy'
        ? value
            .replace('connect-src', 'connect-src http://localhost:9000')
            .replace('; upgrade-insecure-requests', '')
        : value,
    ]),
  );
}

// No manual vendor chunks: measured, splitting React/router/zod into their own files made the
// first load ~10 KB (gzip) larger because separate chunks compress less well. The real savings
// come from lazy routes and steps, and from loading animation features after first paint.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin /api in dev mirrors the Vercel rewrite in production, so the session cookie is
    // first-party in both environments and the browser never needs CORS.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:3000' },
    headers: productionHeaders(),
  },
});
