import { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env';

export function createPrisma(env: Pick<Env, 'DATABASE_URL'>): PrismaClient {
  // Pass the validated URL explicitly rather than letting Prisma read process.env on its own.
  return new PrismaClient({ datasourceUrl: env.DATABASE_URL });
}
