import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end test against the real local stack: web + API + worker (`pnpm dev`), with Postgres
 * and RustFS from docker-compose (`pnpm bootstrap`). Emails go to the file outbox, which the
 * test reads to get the sign-in code and the verification link.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    // E2E_BASE_URL=http://localhost:4173 runs against `vite preview` (production build + CSP).
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // With E2E_BASE_URL set, the servers are expected to be running already.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:5173/api/health',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
