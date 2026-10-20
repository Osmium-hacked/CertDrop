// Runs the retention cleanup once, now. The worker also runs it daily.
// Usage: pnpm --filter @certdrop/api cleanup
import { loadEnv } from '../src/config/env';
import { CleanupService } from '../src/jobs/cleanup';
import { createLogger } from '../src/lib/logger';
import { createPrisma } from '../src/lib/prisma';
import { createS3Storage } from '../src/lib/storage';

const env = loadEnv();
const prisma = createPrisma(env);
try {
  await new CleanupService({
    prisma,
    storage: createS3Storage(env),
    logger: createLogger(env, 'cleanup'),
    retentionDays: env.FILE_RETENTION_DAYS,
  }).run();
} finally {
  await prisma.$disconnect();
}
