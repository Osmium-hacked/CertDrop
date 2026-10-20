import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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
});
