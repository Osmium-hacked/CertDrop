import { pino } from 'pino';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { CleanupService } from '../../src/jobs/cleanup';
import { generateCertId } from '../../src/lib/certId';
import { signIn } from '../helpers/auth';
import { resetDatabase, testPrisma } from '../helpers/db';
import { testEnv } from '../helpers/env';
import { CapturingEmailProvider, InMemoryStorage, noopQueue } from '../helpers/fakes';

const prisma = testPrisma();
const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-06-01T03:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);

let storage: InMemoryStorage;
let cleanup: CleanupService;

beforeEach(async () => {
  await resetDatabase(prisma);
  storage = new InMemoryStorage();
  cleanup = new CleanupService({ prisma, storage, logger: pino({ level: 'silent' }), retentionDays: 30 });
});
afterAll(async () => prisma.$disconnect());

const put = (key: string) => storage.putBytes(key, new Uint8Array([1]), 'application/pdf');

/** A sent batch with two certificates and their files, created `age` days before `now`. */
async function seedBatch(organizerId: string, age: number) {
  const templateKey = `templates/${organizerId}/${age}.pdf`;
  await put(templateKey);
  const template = await prisma.template.create({
    data: {
      organizerId,
      storageKey: templateKey,
      mimeType: 'application/pdf',
      sizeBytes: 1,
      status: 'READY',
      createdAt: daysAgo(age),
    },
  });
  const batch = await prisma.batch.create({
    data: {
      organizerId,
      templateId: template.id,
      eventName: `Event ${age}`,
      issuerName: 'Robotics Club',
      issueDate: daysAgo(age),
      emailSubject: 's',
      emailMessage: 'm',
      layout: {},
      status: 'COMPLETED',
      createdAt: daysAgo(age),
    },
  });
  const ids = [generateCertId(), generateCertId()];
  for (const [rowIndex, id] of ids.entries()) {
    const pdfKey = `certificates/${batch.id}/${id}.pdf`;
    await put(pdfKey);
    await prisma.certificate.create({
      data: {
        id,
        batchId: batch.id,
        rowIndex,
        recipientName: `Person ${rowIndex}`,
        recipientEmail: `p${rowIndex}@example.com`,
        status: 'SENT',
        pdfKey,
      },
    });
  }
  return { batch, template, ids };
}

describe('CleanupService', () => {
  it('deletes old files but keeps the records that verification relies on', async () => {
    const organizer = await prisma.organizer.create({ data: { email: 'organizer@example.com' } });
    const old = await seedBatch(organizer.id, 31);
    const recent = await seedBatch(organizer.id, 5);

    // An upload that never completed, and OTP codes of different ages.
    await put('templates/abandoned.pdf');
    await prisma.template.create({
      data: {
        organizerId: organizer.id,
        storageKey: 'templates/abandoned.pdf',
        mimeType: 'image/png',
        sizeBytes: 1,
        createdAt: daysAgo(2),
      },
    });
    await prisma.otpCode.createMany({
      data: [
        { email: 'a@example.com', codeHash: 'x', expiresAt: daysAgo(2), createdAt: daysAgo(2) },
        { email: 'b@example.com', codeHash: 'y', expiresAt: now, createdAt: now },
      ],
    });

    const result = await cleanup.run(now);
    expect(result).toEqual({
      batches: 1,
      certificateFiles: 2,
      templates: 1,
      abandonedUploads: 1,
      otpCodes: 1,
    });

    // Old batch: files gone, rows kept and marked.
    expect([...storage.objects.keys()].some((k) => k.includes(old.batch.id))).toBe(false);
    expect(await storage.head(old.template.storageKey)).toBeNull();
    const oldBatch = await prisma.batch.findUniqueOrThrow({ where: { id: old.batch.id } });
    expect(oldBatch.filesDeletedAt).toEqual(now);
    expect(await prisma.certificate.count({ where: { batchId: old.batch.id, pdfKey: null } })).toBe(2);
    expect((await prisma.template.findUniqueOrThrow({ where: { id: old.template.id } })).deletedAt).toEqual(
      now,
    );

    // Recent batch untouched.
    expect(await storage.head(recent.template.storageKey)).not.toBeNull();
    expect(
      await prisma.certificate.count({ where: { batchId: recent.batch.id, pdfKey: { not: null } } }),
    ).toBe(2);
    expect(await prisma.otpCode.count()).toBe(1);
    expect(await prisma.template.count({ where: { storageKey: 'templates/abandoned.pdf' } })).toBe(0);

    // Running again changes nothing.
    expect(await cleanup.run(now)).toEqual({
      batches: 0,
      certificateFiles: 0,
      templates: 0,
      abandonedUploads: 0,
      otpCodes: 0,
    });
  });

  it('leaves verification working and answers downloads with 410 Gone', async () => {
    const email = new CapturingEmailProvider();
    const app = await buildApp({
      env: testEnv(),
      logger: pino({ level: 'silent' }),
      prisma,
      storage,
      email,
      queue: noopQueue,
    });
    const cookies = await signIn(app, email, 'organizer@example.com');
    const organizer = await prisma.organizer.findUniqueOrThrow({ where: { email: 'organizer@example.com' } });
    const { batch, ids } = await seedBatch(organizer.id, 40);
    await cleanup.run(now);

    const verify = await app.inject({ method: 'GET', url: `/api/verify/${ids[0]}` });
    expect(verify.json()).toMatchObject({ status: 'valid', certificate: { recipientName: 'Person 0' } });

    for (const [method, url] of [
      ['GET', `/api/batches/${batch.id}/zip`],
      ['GET', `/api/batches/${batch.id}/certificates/${ids[0]}/download`],
      ['POST', `/api/batches/${batch.id}/retry-failed`],
    ] as const) {
      const res = await app.inject({ method, url, cookies });
      expect(res.statusCode, url).toBe(410);
      expect(res.json()).toMatchObject({ error: { code: 'FILES_EXPIRED' } });
    }

    const summary = await app.inject({ method: 'GET', url: `/api/batches/${batch.id}`, cookies });
    expect(summary.json()).toMatchObject({ batch: { filesDeletedAt: now.toISOString() } });
    await app.close();
  });
});
