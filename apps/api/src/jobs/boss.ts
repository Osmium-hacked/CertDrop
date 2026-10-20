import { PgBoss } from 'pg-boss';
import type { Env } from '../config/env';
import type { Logger } from '../lib/logger';

/**
 * pg-boss keeps the job queue in Postgres (its own `pgboss` schema), so the stack needs no Redis.
 * The API uses an instance only to enqueue; the worker process also runs handlers and cron jobs.
 */
export function createBoss(env: Pick<Env, 'DATABASE_URL'>, logger: Logger): PgBoss {
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, application_name: 'certdrop' });
  boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));
  boss.on('warning', (warning) => logger.warn({ warning }, 'pg-boss warning'));
  return boss;
}
