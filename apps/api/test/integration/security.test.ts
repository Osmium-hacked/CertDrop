import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type AppDeps } from '../../src/app';
import { CaptchaUnavailableError, type CaptchaVerifier } from '../../src/lib/captcha';
import { generateCertId } from '../../src/lib/certId';
import { signSvix } from '../../src/lib/webhookSignature';
import { signIn } from '../helpers/auth';
import { resetDatabase, testPrisma } from '../helpers/db';
import { testEnv } from '../helpers/env';
import { CapturingEmailProvider, InMemoryStorage, noopQueue } from '../helpers/fakes';

const prisma = testPrisma();
const WEBHOOK_SECRET = 'whsec_' + Buffer.from('test-webhook-secret-0123456789').toString('base64');

let app: FastifyInstance;
let email: CapturingEmailProvider;

async function makeApp(overrides: Partial<AppDeps> = {}, envOverrides: NodeJS.ProcessEnv = {}) {
  email = new CapturingEmailProvider();
  app = await buildApp({
    env: testEnv({ RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET, ...envOverrides }),
    logger: pino({ level: 'silent' }),
    prisma,
    storage: new InMemoryStorage(),
    email,
    queue: noopQueue,
    ...overrides,
  });
  return app;
}

beforeEach(async () => resetDatabase(prisma));
afterEach(async () => app?.close());
afterAll(async () => prisma.$disconnect());

const requestCode = (body: object) =>
  app.inject({ method: 'POST', url: '/api/auth/otp/request', payload: body });

describe('Turnstile on code requests', () => {
  const captcha = (result: boolean | 'down'): CaptchaVerifier & { tokens: Array<string | undefined> } => {
    const tokens: Array<string | undefined> = [];
    return {
      enabled: true,
      tokens,
      verify: (token) => {
        tokens.push(token);
        return result === 'down'
          ? Promise.reject(new CaptchaUnavailableError('down'))
          : Promise.resolve(result && token === 'ok');
      },
    };
  };

  it('sends no email without a passing token', async () => {
    const verifier = captcha(true);
    await makeApp({ captcha: verifier });

    const missing = await requestCode({ email: 'ana@example.com' });
    expect(missing.statusCode).toBe(403);
    expect(missing.json()).toMatchObject({ error: { code: 'CAPTCHA_FAILED' } });
    expect(email.sent).toHaveLength(0);

    expect((await requestCode({ email: 'ana@example.com', captchaToken: 'ok' })).statusCode).toBe(200);
    expect(email.sent).toHaveLength(1);
    expect(verifier.tokens).toEqual([undefined, 'ok']);
  });

  it('fails closed when the check itself is unavailable', async () => {
    await makeApp({ captcha: captcha('down') });
    const res = await requestCode({ email: 'ana@example.com', captchaToken: 'ok' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: 'CAPTCHA_UNAVAILABLE' } });
    expect(email.sent).toHaveLength(0);
  });
});

describe('daily quotas', () => {
  it('caps template uploads and batches per organizer', async () => {
    await makeApp({}, { TEMPLATES_PER_DAY: '2', BATCHES_PER_DAY: '1' });
    const cookies = await signIn(app, email, 'organizer@example.com');
    const upload = () =>
      app.inject({
        method: 'POST',
        url: '/api/uploads/template',
        cookies,
        payload: { contentType: 'image/png', sizeBytes: 100 },
      });

    expect((await upload()).statusCode).toBe(200);
    expect((await upload()).statusCode).toBe(200);
    const third = await upload();
    expect(third.statusCode).toBe(429);
    expect(third.json()).toMatchObject({ error: { code: 'DAILY_LIMIT_REACHED' } });

    // One batch already today: the next is refused before any validation or work happens.
    const organizer = await prisma.organizer.findUniqueOrThrow({ where: { email: 'organizer@example.com' } });
    const template = await prisma.template.findFirstOrThrow({ where: { organizerId: organizer.id } });
    await prisma.batch.create({
      data: {
        organizerId: organizer.id,
        templateId: template.id,
        eventName: 'e',
        issuerName: 'i',
        issueDate: new Date(),
        emailSubject: 's',
        emailMessage: 'm',
        layout: {},
      },
    });
    const batch = await app.inject({
      method: 'POST',
      url: '/api/batches',
      cookies,
      payload: {
        templateId: template.id,
        layout: {
          nameBox: { x: 0.1, y: 0.4, width: 0.8, height: 0.1 },
          font: 'inter',
          fontSize: 40,
          color: '#000000',
          align: 'center',
          qrBox: null,
        },
        event: {
          eventName: 'e',
          issuerName: 'i',
          issueDate: '2026-01-01',
          emailSubject: 's',
          emailMessage: 'm',
        },
        recipients: [{ name: 'Ana', email: 'ana@example.com' }],
      },
    });
    expect(batch.statusCode).toBe(429);
    expect(batch.json()).toMatchObject({ error: { code: 'DAILY_LIMIT_REACHED' } });
  });
});

describe('POST /api/webhooks/resend', () => {
  async function seedSentCertificate(messageId: string) {
    const organizer = await prisma.organizer.create({ data: { email: 'o@example.com' } });
    const template = await prisma.template.create({
      data: {
        organizerId: organizer.id,
        storageKey: 'k',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        status: 'READY',
      },
    });
    const batch = await prisma.batch.create({
      data: {
        organizerId: organizer.id,
        templateId: template.id,
        eventName: 'e',
        issuerName: 'i',
        issueDate: new Date(),
        emailSubject: 's',
        emailMessage: 'm',
        layout: {},
      },
    });
    return prisma.certificate.create({
      data: {
        id: generateCertId(),
        batchId: batch.id,
        rowIndex: 0,
        recipientName: 'Ana',
        recipientEmail: 'ana@example.com',
        status: 'SENT',
        emailMessageId: messageId,
      },
    });
  }

  const deliver = (event: object, opts: { secret?: string; timestamp?: number } = {}) => {
    const body = JSON.stringify(event);
    const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
    const id = `msg_${Math.random().toString(36).slice(2)}`;
    return app.inject({
      method: 'POST',
      url: '/api/webhooks/resend',
      headers: {
        'content-type': 'application/json',
        'svix-id': id,
        'svix-timestamp': String(timestamp),
        'svix-signature': signSvix(opts.secret ?? WEBHOOK_SECRET, id, timestamp, body),
      },
      payload: body,
    });
  };
  const statusOf = async (id: string) =>
    (await prisma.certificate.findUniqueOrThrow({ where: { id } })).deliveryStatus;

  it('records deliveries and bounces, never moving backwards', async () => {
    await makeApp();
    const cert = await seedSentCertificate('re_123');

    expect((await deliver({ type: 'email.delivered', data: { email_id: 're_123' } })).statusCode).toBe(200);
    expect(await statusOf(cert.id)).toBe('DELIVERED');

    await deliver({ type: 'email.bounced', data: { email_id: 're_123' } });
    expect(await statusOf(cert.id)).toBe('BOUNCED');

    // A late, out-of-order "delivered" doesn't hide the bounce.
    await deliver({ type: 'email.delivered', data: { email_id: 're_123' } });
    expect(await statusOf(cert.id)).toBe('BOUNCED');

    await deliver({ type: 'email.complained', data: { email_id: 're_123' } });
    expect(await statusOf(cert.id)).toBe('COMPLAINED');
  });

  it('acknowledges events it does not track', async () => {
    await makeApp();
    expect((await deliver({ type: 'email.opened', data: { email_id: 're_x' } })).json()).toEqual({
      received: true,
    });
    expect((await deliver({ type: 'email.delivered', data: { email_id: 'unknown' } })).statusCode).toBe(200);
  });

  it('rejects bad signatures and stale deliveries', async () => {
    await makeApp();
    const cert = await seedSentCertificate('re_456');
    const event = { type: 'email.bounced', data: { email_id: 're_456' } };

    const forged = await deliver(event, { secret: 'whsec_' + Buffer.from('attacker').toString('base64') });
    expect(forged.statusCode).toBe(401);
    const stale = await deliver(event, { timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect(stale.statusCode).toBe(401);
    expect(await statusOf(cert.id)).toBeNull();
  });

  it('is disabled when no secret is configured', async () => {
    await makeApp({ env: testEnv() });
    expect((await deliver({ type: 'email.delivered', data: { email_id: 'x' } })).statusCode).toBe(404);
  });
});
