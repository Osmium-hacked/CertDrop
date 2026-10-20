import path from 'node:path';
import { loadEnv } from './config/env';
import { createEmailProvider } from './email';
import { createBoss } from './jobs/boss';
import { CertificateProcessor, registerCertificateWorkers } from './jobs/certificates';
import { CLEANUP_CRON, CLEANUP_QUEUE, CleanupService } from './jobs/cleanup';
import { ensureQueues, PgBossCertificateQueue } from './jobs/queues';
import { createLogger } from './lib/logger';
import { createPrisma } from './lib/prisma';
import { IntervalRateLimiter } from './lib/rateLimiter';
import { createS3Storage } from './lib/storage';
import { FontLibrary } from './pdf/fonts';

// Background worker: a separate process from the API so slow PDF rendering and email sending never
// block HTTP requests, and so each can be scaled and restarted independently.

const env = loadEnv();
const logger = createLogger(env, 'worker');
const prisma = createPrisma(env);
const boss = createBoss(env, logger, 'worker');
const storage = createS3Storage(env);

// A failing job must never take the process down; handlers catch their own errors and record them
// on the row. These are the last line of defence for anything that slips through.
process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'unhandled rejection'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception, exiting so the platform restarts the worker');
  process.exit(1);
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'worker shutting down, finishing in-flight jobs');
  await boss.stop({ graceful: true, timeout: 30_000 });
  await prisma.$disconnect();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await boss.start();
  await ensureQueues(boss);
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
  logger.info(
    { generateConcurrency: env.GENERATE_CONCURRENCY, emailsPerSecond: env.EMAIL_RATE_PER_SECOND },
    'worker ready',
  );
} catch (err) {
  logger.fatal({ err }, 'worker failed to start');
  process.exit(1);
}
