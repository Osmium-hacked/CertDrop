import { PrismaClient } from '@prisma/client';
import { inject } from 'vitest';

let client: PrismaClient | undefined;

/** One client per test file, pointed at the database prepared by test/setup/database.ts. */
export function testPrisma(): PrismaClient {
  client ??= new PrismaClient({ datasourceUrl: inject('databaseUrl') });
  return client;
}

/** Empties every application table (pg-boss keeps its own schema and is left alone). */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Certificate", "Batch", "Template", "OtpCode", "Organizer" RESTART IDENTITY CASCADE',
  );
}
