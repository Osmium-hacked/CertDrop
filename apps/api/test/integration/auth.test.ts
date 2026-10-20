import { OTP_POLICY } from '@certdrop/shared';
import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { SESSION_COOKIE } from '../../src/modules/auth/session';
import { resetDatabase, testPrisma } from '../helpers/db';
import { testEnv } from '../helpers/env';
import { CapturingEmailProvider, noopQueue, okStorage, TestClock } from '../helpers/fakes';

const prisma = testPrisma();
const EMAIL = 'ana@example.com';

let app: FastifyInstance;
let email: CapturingEmailProvider;
let clock: TestClock;

beforeEach(async () => {
  await resetDatabase(prisma);
  email = new CapturingEmailProvider();
  clock = new TestClock();
  // A fresh app per test also gives each test a fresh in-memory rate limiter.
  app = await buildApp({
    env: testEnv(),
    logger: pino({ level: 'silent' }),
    prisma,
    storage: okStorage,
    email,
    queue: noopQueue,
    now: clock.now,
  });
});

afterEach(async () => app.close());
afterAll(async () => prisma.$disconnect());

const requestCode = (to = EMAIL, ip = '203.0.113.7') =>
  app.inject({ method: 'POST', url: '/api/auth/otp/request', payload: { email: to }, remoteAddress: ip });

const verifyCode = (code: string, to = EMAIL) =>
  app.inject({ method: 'POST', url: '/api/auth/otp/verify', payload: { email: to, code } });

const wrongCode = (code: string) => (code === '000000' ? '000001' : '000000');

describe('OTP sign-in', () => {
  it('emails a code and exchanges it for a session cookie', async () => {
    const requested = await requestCode();
    expect(requested.statusCode).toBe(200);
    expect(requested.json()).toEqual({
      expiresInSeconds: OTP_POLICY.ttlSeconds,
      resendInSeconds: OTP_POLICY.resendCooldownSeconds,
    });
    expect(requested.headers['cache-control']).toBe('no-store');

    const code = email.lastCodeFor(EMAIL);
    const verified = await verifyCode(code);
    expect(verified.statusCode).toBe(200);
    expect(verified.json()).toMatchObject({ organizer: { email: EMAIL } });

    const cookie = verified.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api' });

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { [SESSION_COOKIE]: cookie!.value },
    });
    expect(me.json()).toMatchObject({ organizer: { email: EMAIL } });

    const organizer = await prisma.organizer.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(organizer.verifiedAt).not.toBeNull();
  });

  it('stores only a hash of the code', async () => {
    await requestCode();
    const code = email.lastCodeFor(EMAIL);
    const row = await prisma.otpCode.findFirstOrThrow({ where: { email: EMAIL } });
    expect(row.codeHash).not.toContain(code);
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('normalizes the email address', async () => {
    await requestCode('  Ana@Example.COM ');
    const verified = await verifyCode(email.lastCodeFor(EMAIL), 'ANA@example.com');
    expect(verified.statusCode).toBe(200);
  });

  it('rejects invalid input with field errors', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/otp/request',
      payload: { email: 'nope' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: { code: string; fields?: Record<string, string[]> } }>();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.fields?.email?.length).toBeGreaterThan(0);
  });

  it('rejects an expired code', async () => {
    await requestCode();
    clock.advance(OTP_POLICY.ttlSeconds + 1);
    const res = await verifyCode(email.lastCodeFor(EMAIL));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'OTP_INVALID' } });
  });

  it('locks the code after too many wrong guesses, even for the right code', async () => {
    await requestCode();
    const code = email.lastCodeFor(EMAIL);

    for (let i = 1; i < OTP_POLICY.maxAttempts; i++) {
      const res = await verifyCode(wrongCode(code));
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: 'OTP_INCORRECT' } });
    }
    expect((await verifyCode(wrongCode(code))).json()).toMatchObject({ error: { code: 'OTP_LOCKED' } });
    const final = await verifyCode(code);
    expect(final.statusCode).toBe(429);
    expect(final.json()).toMatchObject({ error: { code: 'OTP_LOCKED' } });
  });

  it('cannot be raced past the attempt limit with parallel guesses', async () => {
    await requestCode();
    const code = email.lastCodeFor(EMAIL);
    await Promise.all(Array.from({ length: 20 }, () => verifyCode(wrongCode(code))));
    const row = await prisma.otpCode.findFirstOrThrow({ where: { email: EMAIL } });
    expect(row.attempts).toBe(OTP_POLICY.maxAttempts);
  });

  it('is single-use', async () => {
    await requestCode();
    const code = email.lastCodeFor(EMAIL);
    expect((await verifyCode(code)).statusCode).toBe(200);
    expect((await verifyCode(code)).statusCode).toBe(400);
  });

  it('enforces the resend cooldown and invalidates the previous code', async () => {
    await requestCode();
    const first = email.lastCodeFor(EMAIL);

    const tooSoon = await requestCode();
    expect(tooSoon.statusCode).toBe(429);
    // The real remaining wait, so the UI's resend countdown starts from the right number.
    expect(tooSoon.json()).toMatchObject({
      error: { code: 'OTP_COOLDOWN', retryAfterSeconds: OTP_POLICY.resendCooldownSeconds },
    });
    expect(tooSoon.headers['retry-after']).toBe(String(OTP_POLICY.resendCooldownSeconds));
    clock.advance(25);
    expect((await requestCode()).json()).toMatchObject({ error: { retryAfterSeconds: 35 } });
    clock.advance(-25);

    clock.advance(OTP_POLICY.resendCooldownSeconds);
    expect((await requestCode()).statusCode).toBe(200);
    const second = email.lastCodeFor(EMAIL);

    if (first !== second) expect((await verifyCode(first)).statusCode).toBe(400);
    expect((await verifyCode(second)).statusCode).toBe(200);
  });

  it('caps codes per email per hour', async () => {
    for (let i = 0; i < OTP_POLICY.maxPerEmailPerHour; i++) {
      expect((await requestCode()).statusCode).toBe(200);
      clock.advance(OTP_POLICY.resendCooldownSeconds);
    }
    const capped = await requestCode();
    expect(capped.statusCode).toBe(429);
    expect(capped.json()).toMatchObject({ error: { code: 'OTP_HOURLY_LIMIT' } });

    clock.advance(60 * 60);
    expect((await requestCode()).statusCode).toBe(200);
  });

  it('reports email failures and lets the organizer retry immediately', async () => {
    email.failNext = true;
    const failed = await requestCode();
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toMatchObject({ error: { code: 'EMAIL_FAILED' } });
    expect(await prisma.otpCode.count()).toBe(0);

    expect((await requestCode()).statusCode).toBe(200);
  });

  it('rate-limits code requests per IP', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await requestCode(`user${i}@example.com`)).statusCode).toBe(200);
    }
    const limited = await requestCode('user10@example.com');
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });

    // A different client is unaffected.
    expect((await requestCode('user11@example.com', '198.51.100.4')).statusCode).toBe(200);
  });
});

describe('sessions', () => {
  it('returns a null organizer without a cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ organizer: null });
  });

  it('ignores a tampered cookie', async () => {
    await requestCode();
    const verified = await verifyCode(email.lastCodeFor(EMAIL));
    const token = verified.cookies.find((c) => c.name === SESSION_COOKIE)!.value;
    const [header, payload, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'someone-else', email: 'evil@example.com' })).toString(
      'base64url',
    );

    for (const value of [
      `${header}.${forged}.${signature}`,
      `${header}.${payload}.x${signature}`,
      'garbage',
    ]) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { [SESSION_COOKIE]: value },
      });
      expect(res.json()).toEqual({ organizer: null });
    }
  });

  it('clears the cookie on logout', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(204);
    const cleared = res.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cleared?.value).toBe('');
  });
});
