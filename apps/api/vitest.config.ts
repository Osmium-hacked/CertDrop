import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['test/unit/**/*.test.ts'] },
      },
      {
        // Runs against the docker-compose services: Postgres (database "certdrop_test") and
        // RustFS (bucket "certdrop-test").
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/setup/database.ts', 'test/setup/storage.ts'],
          // Files share one database and truncate it between tests, so they run one at a time.
          fileParallelism: false,
          testTimeout: 15_000,
        },
      },
    ],
  },
});
