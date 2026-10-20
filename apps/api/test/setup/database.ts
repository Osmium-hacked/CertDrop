import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import path from 'node:path';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const DEFAULT_URL = 'postgresql://certdrop:certdrop@localhost:5432/certdrop_test';

/**
 * Creates the test database if needed and brings it up to the latest migration, once per run.
 * Uses its own database so tests never touch development data.
 */
export default async function setup(project: TestProject): Promise<void> {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_URL;
  const target = new URL(databaseUrl);
  const dbName = target.pathname.slice(1);
  if (!/^[a-z0-9_]+$/i.test(dbName)) throw new Error(`Unexpected test database name: ${dbName}`);

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  try {
    const existing = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (existing.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } catch (err) {
    throw new Error(
      `Integration tests need Postgres at ${target.host}. Start it with \`docker compose up -d\`.`,
      { cause: err },
    );
  } finally {
    await admin.$disconnect();
  }

  execSync('pnpm exec prisma migrate deploy', {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  project.provide('databaseUrl', databaseUrl);
}
