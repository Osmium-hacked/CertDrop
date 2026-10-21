import { buildApp } from './app';
import { loadEnv } from './config/env';
import { createEmailProvider } from './email';
import { credentialFingerprint } from './email/gmail.provider';
import { createBoss } from './jobs/boss';
import { ensureQueues, PgBossCertificateQueue } from './jobs/queues';
import { startJobRunner } from './jobs/runner';
import { disabledCaptcha, TurnstileVerifier } from './lib/captcha';
import { createLogger } from './lib/logger';
import { createPrisma } from './lib/prisma';
import { createS3Storage } from './lib/storage';

const env = loadEnv();
const logger = createLogger(env, 'api');
const prisma = createPrisma(env);
const storage = createS3Storage(env);
const email = createEmailProvider(env);
// Normally the API only enqueues jobs and the worker process runs them. RUN_WORKER_IN_API runs
// both here, for hosts with a single free instance and no background workers.
const boss = createBoss(env, logger, env.RUN_WORKER_IN_API ? 'worker' : 'api');

if (env.EMAIL_PROVIDER === 'gmail' && env.GMAIL_REFRESH_TOKEN) {
  // Lets you check the deployed token matches the one gmail:token saved, without exposing it.
  logger.info(
    {
      refreshTokenLength: env.GMAIL_REFRESH_TOKEN.length,
      refreshTokenFingerprint: credentialFingerprint(env.GMAIL_REFRESH_TOKEN),
    },
    'gmail credentials loaded',
  );
}

if (env.RUN_WORKER_IN_API) {
  // Same last line of defence as the worker process: one bad job mustn't take the API down.
  process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'unhandled rejection'));
}

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down');
  await app.close();
  await boss.stop(env.RUN_WORKER_IN_API ? { graceful: true, timeout: 30_000 } : { graceful: false });
  await prisma.$disconnect();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

let app: Awaited<ReturnType<typeof buildApp>>;
try {
  await boss.start();
  await ensureQueues(boss);
  app = await buildApp({
    env,
    logger,
    prisma,
    storage,
    email,
    queue: new PgBossCertificateQueue(boss),
    captcha: env.TURNSTILE_SECRET_KEY ? new TurnstileVerifier(env.TURNSTILE_SECRET_KEY) : disabledCaptcha,
  });
  if (env.RUN_WORKER_IN_API) await startJobRunner({ env, logger, prisma, storage, boss });
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (err) {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
}
