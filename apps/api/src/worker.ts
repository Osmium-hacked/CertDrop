import { loadEnv } from './config/env';
import { createBoss } from './jobs/boss';
import { createLogger } from './lib/logger';
import { createPrisma } from './lib/prisma';

// Background worker: a separate process from the API so slow PDF rendering and email sending never
// block HTTP requests, and so each can be scaled and restarted independently.
// Queue handlers (generate, send, cleanup) are registered here as they are built.

const env = loadEnv();
const logger = createLogger(env, 'worker');
const prisma = createPrisma(env);
const boss = createBoss(env, logger);

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
  logger.info('worker ready');
} catch (err) {
  logger.fatal({ err }, 'worker failed to start');
  process.exit(1);
}
