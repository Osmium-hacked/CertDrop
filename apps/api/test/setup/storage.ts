import { setTimeout as sleep } from 'node:timers/promises';
import { loadEnv } from '../../src/config/env';
import { createS3Storage } from '../../src/lib/storage';
import { BASE_TEST_ENV, TEST_STORAGE_ENV } from '../helpers/env';

/** Creates the integration-test bucket (separate from development's) once per run. */
export default async function setup(): Promise<void> {
  const env = loadEnv({ ...BASE_TEST_ENV, ...TEST_STORAGE_ENV });
  const storage = createS3Storage(env);

  // A freshly started storage container (e.g. a CI service) can take a few seconds to accept requests.
  for (let attempt = 1; ; attempt++) {
    try {
      await storage.ensureBucket([env.PUBLIC_APP_URL]);
      return;
    } catch (err) {
      if (attempt >= 15) {
        throw new Error(
          `Integration tests need S3-compatible storage at ${env.S3_ENDPOINT}. Start it with \`docker compose up -d\`.`,
          { cause: err },
        );
      }
      await sleep(1000);
    }
  }
}
