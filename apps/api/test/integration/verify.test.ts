import { VerifyResponseSchema } from '@certdrop/shared';
import type { CertificateStatus } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { generateCertId } from '../../src/lib/certId';
import { signIn } from '../helpers/auth';
import { resetDatabase, testPrisma } from '../helpers/db';
import { testEnv } from '../helpers/env';
import { CapturingEmailProvider, InMemoryStorage, noopQueue } from '../helpers/fakes';

const prisma = testPrisma();
let app: FastifyInstance;
let email: CapturingEmailProvider;

beforeEach(async () => {
  await resetDatabase(prisma);
  email = new CapturingEmailProvider();
  app = await buildApp({
    env: testEnv(),
    logger: pino({ level: 'silent' }),
    prisma,
    storage: new InMemoryStorage(),
    email,
    queue: noopQueue,
  });
});
afterEach(async () => app.close());
afterAll(async () => prisma.$disconnect());

/** A batch for `organizerEmail` with one certificate per status, straight into the database. */
async function seedBatch(organizerEmail = 'organizer@example.com') {
  const organizer = await prisma.organizer.upsert({
    where: { email: organizerEmail },
    create: { email: organizerEmail },
    update: {},
  });
  const template = await prisma.template.create({
    data: {
      organizerId: organizer.id,
      storageKey: `t/${organizer.id}`,
      mimeType: 'application/pdf',
      sizeBytes: 1,
      status: 'READY',
    },
  });
  const batch = await prisma.batch.create({
    data: {
      organizerId: organizer.id,
      templateId: template.id,
      eventName: 'Spring Hackathon 2026',
      issuerName: 'Robotics Club',
      issueDate: new Date('2026-04-18T00:00:00Z'),
      emailSubject: 's',
      emailMessage: 'm',
      layout: {},
    },
  });
  const statuses: CertificateStatus[] = ['SENT', 'GENERATED', 'QUEUED', 'FAILED'];
  const ids = Object.fromEntries(statuses.map((s) => [s, generateCertId()])) as Record<
    CertificateStatus,
    string
  >;
  await prisma.certificate.createMany({
    data: statuses.map((status, rowIndex) => ({
      id: ids[status],
      batchId: batch.id,
      rowIndex,
      recipientName: `Ana ${status.toLowerCase()}`,
      recipientEmail: `ana.${status.toLowerCase()}@example.com`,
      status,
    })),
  });
  return { batch, ids };
}

const verify = (certId: string) =>
  app.inject({ method: 'GET', url: `/api/verify/${encodeURIComponent(certId)}` });

describe('GET /api/verify/:certId', () => {
  it('confirms an issued certificate without exposing the email address', async () => {
    const { ids } = await seedBatch();
    const res = await verify(ids.SENT);
    expect(res.statusCode).toBe(200);
    expect(VerifyResponseSchema.parse(res.json())).toEqual({
      status: 'valid',
      certificate: {
        id: ids.SENT,
        recipientName: 'Ana sent',
        eventName: 'Spring Hackathon 2026',
        issuerName: 'Robotics Club',
        issueDate: '2026-04-18',
      },
    });
    expect(res.body).not.toContain('@');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });

  it('treats a generated-but-not-yet-emailed certificate as issued', async () => {
    const { ids } = await seedBatch();
    expect((await verify(ids.GENERATED)).json()).toMatchObject({ status: 'valid' });
  });

  it.each(['QUEUED', 'FAILED'] as const)('hides %s certificates as if they did not exist', async (status) => {
    const { ids } = await seedBatch();
    const res = await verify(ids[status]);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'CERTIFICATE_NOT_FOUND' } });
  });

  it.each(['CD-2222222222', 'CD-nope', 'not-even-close', "CD-1' OR '1'='1"])(
    'returns 404 for %s',
    async (id) => {
      expect((await verify(id)).statusCode).toBe(404);
    },
  );

  it('rate-limits lookups per IP', async () => {
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await verify('CD-2222222222')).statusCode;
    expect(last).toBe(429);
  });
});

describe('revoking certificates', () => {
  it('lets the organizer revoke and restore, and the verify page follows', async () => {
    const { batch, ids } = await seedBatch();
    const cookies = await signIn(app, email, 'organizer@example.com');
    const url = (action: string) => `/api/batches/${batch.id}/certificates/${ids.SENT}/${action}`;

    const revoked = await app.inject({ method: 'POST', url: url('revoke'), cookies });
    expect(revoked.statusCode).toBe(200);
    const { revokedAt } = revoked.json<{ revokedAt: string }>();

    const check = VerifyResponseSchema.parse((await verify(ids.SENT)).json());
    expect(check).toEqual({
      status: 'revoked',
      certificate: {
        id: ids.SENT,
        eventName: 'Spring Hackathon 2026',
        issuerName: 'Robotics Club',
        revokedAt,
      },
    });
    expect(JSON.stringify(check)).not.toContain('Ana');

    // Revoking again keeps the original time.
    const again = await app.inject({ method: 'POST', url: url('revoke'), cookies });
    expect(again.json()).toEqual({ revokedAt });

    const restored = await app.inject({ method: 'POST', url: url('restore'), cookies });
    expect(restored.json()).toEqual({ revokedAt: null });
    expect((await verify(ids.SENT)).json()).toMatchObject({ status: 'valid' });
  });

  it('only revokes issued certificates in your own batches', async () => {
    const mine = await seedBatch();
    const theirs = await seedBatch('other@example.com');
    const cookies = await signIn(app, email, 'organizer@example.com');

    const queued = await app.inject({
      method: 'POST',
      url: `/api/batches/${mine.batch.id}/certificates/${mine.ids.QUEUED}/revoke`,
      cookies,
    });
    expect(queued.statusCode).toBe(404);

    const foreign = await app.inject({
      method: 'POST',
      url: `/api/batches/${theirs.batch.id}/certificates/${theirs.ids.SENT}/revoke`,
      cookies,
    });
    expect(foreign.statusCode).toBe(404);
    // A certificate ID from another batch can't be reached through one of your own batches either.
    const crossed = await app.inject({
      method: 'POST',
      url: `/api/batches/${mine.batch.id}/certificates/${theirs.ids.SENT}/revoke`,
      cookies,
    });
    expect(crossed.statusCode).toBe(404);
    expect((await verify(theirs.ids.SENT)).json()).toMatchObject({ status: 'valid' });
  });

  it('requires a signed-in organizer', async () => {
    const { batch, ids } = await seedBatch();
    const res = await app.inject({
      method: 'POST',
      url: `/api/batches/${batch.id}/certificates/${ids.SENT}/revoke`,
    });
    expect(res.statusCode).toBe(401);
  });
});
