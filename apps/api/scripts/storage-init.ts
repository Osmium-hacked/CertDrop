// Creates the storage bucket and applies its CORS rules. Safe to run repeatedly.
// Usage: pnpm --filter @certdrop/api storage:init
import { setTimeout as sleep } from 'node:timers/promises';
import { loadEnv } from '../src/config/env';
import { createS3Storage } from '../src/lib/storage';

const env = loadEnv();
const storage = createS3Storage(env);
const origins = [env.PUBLIC_APP_URL, ...env.CORS_ORIGINS];

// The storage container can report "running" a moment before it accepts requests.
for (let attempt = 1; ; attempt++) {
  try {
    const { created } = await storage.ensureBucket(origins);
    console.log(
      `Bucket "${env.S3_BUCKET}" ${created ? 'created' : 'already exists'}; CORS allows ${origins.join(', ')}`,
    );
    break;
  } catch (err) {
    if (attempt >= 10) throw err;
    await sleep(1000);
  }
}
