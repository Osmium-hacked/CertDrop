import { buildApp } from './app';
import { loadEnv } from './config/env';
import { createEmailProvider } from './email';
import { createLogger } from './lib/logger';
import { createPrisma } from './lib/prisma';
import { createS3Storage } from './lib/storage';

const env = loadEnv();
const logger = createLogger(env, 'api');
const prisma = createPrisma(env);
const storage = createS3Storage(env);
const email = createEmailProvider(env);

const app = await buildApp({ env, logger, prisma, storage, email });

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down');
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (err) {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
}
