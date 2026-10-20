import { HealthResponseSchema } from '@certdrop/shared';
import type { PrismaClient } from '@prisma/client';
import { pino } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import type { Storage } from '../../src/lib/storage';
import { testEnv } from '../helpers/env';
import { CapturingEmailProvider, InMemoryStorage, noopQueue } from '../helpers/fakes';

const env = testEnv();

// Only the slice of PrismaClient the health route touches.
function fakePrisma(ok: boolean): PrismaClient {
  return {
    $queryRaw: () =>
      ok ? Promise.resolve([{ '?column?': 1 }]) : Promise.reject(new Error('connection refused')),
  } as unknown as PrismaClient;
}

function fakeStorage(ok: boolean): Storage {
  return new InMemoryStorage(ok ? undefined : new Error('NoSuchBucket'));
}

async function makeApp(dbOk: boolean, storageOk: boolean) {
  return buildApp({
    env,
    logger: pino({ level: 'silent' }),
    prisma: fakePrisma(dbOk),
    storage: fakeStorage(storageOk),
    queue: noopQueue,
    email: new CapturingEmailProvider(),
  });
}

describe('GET /api/health', () => {
  let app: Awaited<ReturnType<typeof makeApp>> | undefined;
  afterEach(async () => app?.close());

  it('returns 200 when every dependency is up', async () => {
    app = await makeApp(true, true);
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = HealthResponseSchema.parse(res.json());
    expect(body).toMatchObject({ status: 'ok', checks: { database: 'ok', storage: 'ok' } });
  });

  it('returns 503 and names the failing dependency', async () => {
    app = await makeApp(true, false);
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(503);
    expect(HealthResponseSchema.parse(res.json())).toMatchObject({
      status: 'degraded',
      checks: { database: 'ok', storage: 'down' },
    });
  });

  it('sends security headers', async () => {
    app = await makeApp(true, true);
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });
});

describe('error responses', () => {
  it('returns the shared ApiError shape for unknown routes', async () => {
    const app = await makeApp(true, true);
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    await app.close();
  });

  it('rejects CORS preflights from origins outside the allowlist', async () => {
    const app = await makeApp(true, true);
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });
});
