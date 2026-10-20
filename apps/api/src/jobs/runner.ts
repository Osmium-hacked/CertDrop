import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { PgBoss } from 'pg-boss';
import type { Env } from '../config/env';
import { createEmailProvider } from '../email';
import type { Logger } from '../lib/logger';
import { IntervalRateLimiter } from '../lib/rateLimiter';
import type { Storage } from '../lib/storage';
import { FontLibrary } from '../pdf/fonts';
import { CertificateProcessor, registerCertificateWorkers } from './certificates';
import { CLEANUP_CRON, CLEANUP_QUEUE, CleanupService } from './cleanup';
import { PgBossCertificateQueue } from './queues';

/** A restart within this window doesn't queue another startup cleanup. */
const STARTUP_CLEANUP_THROTTLE_SECONDS = 6 * 60 * 60;

/**
 * Starts the certificate pipeline and the cleanup schedule on a started pg-boss instance. Used by
 * the worker process, and by the API itself when RUN_WORKER_IN_API is set (single-instance hosts).
 */
export async function startJobRunner(deps: {
  env: Env;
  logger: Logger;
  prisma: PrismaClient;
  storage: Storage;
  boss: PgBoss;
}): Promise<void> {
  const { env, logger, prisma, storage, boss } = deps;
  const processor = new CertificateProcessor({
    prisma,
    storage,
    email: createEmailProvider(env),
    fonts: new FontLibrary(path.resolve(env.FONTS_DIR)),
    queue: new PgBossCertificateQueue(boss),
    emailLimiter: new IntervalRateLimiter(env.EMAIL_RATE_PER_SECOND),
    publicAppUrl: env.PUBLIC_APP_URL,
    logger,
  });
  await registerCertificateWorkers(boss, processor, env);

  // Daily data cleanup. pg-boss's cron runs it once across all worker instances.
  const cleanup = new CleanupService({ prisma, storage, logger, retentionDays: env.FILE_RETENTION_DAYS });
  if (!(await boss.getQueue(CLEANUP_QUEUE))) await boss.createQueue(CLEANUP_QUEUE, { retryLimit: 2 });
  await boss.schedule(CLEANUP_QUEUE, CLEANUP_CRON, null, { tz: 'UTC' });
  await boss.work(CLEANUP_QUEUE, async () => {
    await cleanup.run();
  });
  // Hosts that sleep when idle (free tiers) are rarely awake at 03:00, so also clean up on start.
  await boss.send(CLEANUP_QUEUE, null, {
    singletonKey: 'startup',
    singletonSeconds: STARTUP_CLEANUP_THROTTLE_SECONDS,
  });

  logger.info(
    { generateConcurrency: env.GENERATE_CONCURRENCY, emailsPerSecond: env.EMAIL_RATE_PER_SECOND },
    'job runner ready',
  );
}
