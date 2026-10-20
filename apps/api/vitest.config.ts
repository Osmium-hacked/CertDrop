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
        // Runs against a real Postgres (the docker-compose one, database "certdrop_test").
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/setup/database.ts'],
          // Files share one database and truncate it between tests, so they run one at a time.
          fileParallelism: false,
          testTimeout: 15_000,
        },
      },
    ],
  },
});
