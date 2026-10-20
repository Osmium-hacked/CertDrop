import { BatchResponseSchema, CertificatePageSchema, type Layout } from '@certdrop/shared';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PgBoss } from 'pg-boss';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../../src/app';
import { EmailSendError } from '../../src/email';
import { FileEmailProvider } from '../../src/email/file.provider';
import { createBoss } from '../../src/jobs/boss';
import { CertificateProcessor, registerCertificateWorkers } from '../../src/jobs/certificates';
import { ensureQueues, PgBossCertificateQueue } from '../../src/jobs/queues';
import { IntervalRateLimiter } from '../../src/lib/rateLimiter';
import { createS3Storage } from '../../src/lib/storage';
import { FontLibrary } from '../../src/pdf/fonts';
import { signIn } from '../helpers/auth';
import { resetDatabase, testPrisma } from '../helpers/db';
import { TEST_STORAGE_ENV, testEnv } from '../helpers/env';
import { CapturingEmailProvider, FlakyEmailProvider } from '../helpers/fakes';
import { makePdf } from '../helpers/files';
import { extractText } from '../helpers/pdfText';
import { uploadTemplate } from '../helpers/templates';

// The whole pipeline for real: API → Postgres → pg-boss worker (in-process) → RustFS → email
// written to disk by the file provider. Only time is shortened (fast polling, fast rate limit).

const prisma = testPrisma();
const env = testEnv({ ...TEST_STORAGE_ENV, DATABASE_URL: inject('databaseUrl') });
const storage = createS3Storage(env);
const logger = pino({ level: 'silent' });
const fonts = new FontLibrary(path.resolve(import.meta.dirname, '../../../../packages/shared/fonts'));

let outbox: string;
let email: FlakyEmailProvider;
let boss: PgBoss;
let processor: CertificateProcessor;
let app: FastifyInstance;
let cookies: Record<string, string>;
/** Captures sign-in codes; certificate emails go through email (written to disk). */
const otpEmail = new CapturingEmailProvider();

const layout: Layout = {
  nameBox: { x: 0.15, y: 0.42, width: 0.7, height: 0.13 },
  font: 'playfair-display',
  fontSize: 44,
  color: '#1f2433',
  align: 'center',
  qrBox: { x: 0.8, y: 0.7, width: 0.12, height: 0.17 },
};

const event = {
  eventName: 'Spring Hackathon 2026',
  issuerName: 'Robotics Club',
  issueDate: '2026-04-18',
  emailSubject: 'Your certificate for {event}',
  emailMessage: 'Hi {name},\n\nThanks for joining {event}.\n\n{issuer}',
};

beforeAll(async () => {
  outbox = await mkdtemp(path.join(tmpdir(), 'certdrop-outbox-'));
  email = new FlakyEmailProvider(new FileEmailProvider(outbox, env.EMAIL_FROM_ADDRESS));
  boss = createBoss(env, logger, 'worker');
  await boss.start();
  await ensureQueues(boss);
  const queue = new PgBossCertificateQueue(boss);
  processor = new CertificateProcessor({
    prisma,
    storage,
    email,
    fonts,
    queue,
    emailLimiter: new IntervalRateLimiter(50),
    publicAppUrl: env.PUBLIC_APP_URL,
    logger,
  });
  await registerCertificateWorkers(
    boss,
    processor,
    { GENERATE_CONCURRENCY: 3 },
    { pollingIntervalSeconds: 0.5 },
  );
  app = await buildApp({ env, logger, prisma, storage, email: otpEmail, queue });
}, 30_000);

afterAll(async () => {
  await app.close();
  await boss.stop({ graceful: false, timeout: 5_000 });
  await prisma.$disconnect();
  await rm(outbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetDatabase(prisma);
  await rm(outbox, { recursive: true, force: true });
  email.failures.length = 0;
  cookies = await signIn(app, otpEmail, 'organizer@example.com');
});

async function createBatch(recipients: Array<{ name: string; email: string }>, as = cookies) {
  const templateId = await uploadTemplate(app, as, await makePdf([[842, 595]]), 'application/pdf');
  return app.inject({
    method: 'POST',
    url: '/api/batches',
    cookies: as,
    payload: { templateId, layout, event, recipients },
  });
}

async function waitForBatch(id: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await app.inject({ method: 'GET', url: `/api/batches/${id}`, cookies });
    const { batch } = BatchResponseSchema.parse(res.json());
    if (batch.status !== 'PROCESSING') return batch;
    if (Date.now() > deadline) throw new Error(`Batch still processing: ${JSON.stringify(batch.counts)}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function readOutbox() {
  const folders = await readdir(outbox).catch(() => []);
  return Promise.all(
    folders.map(async (folder) => {
      const dir = path.join(outbox, folder);
      const message = JSON.parse(await readFile(path.join(dir, 'message.json'), 'utf8')) as {
        to: string;
        from: string;
        replyTo: string;
        subject: string;
        text: string;
        attachments: Array<{ filename: string }>;
      };
      const pdf = new Uint8Array(await readFile(path.join(dir, message.attachments[0]!.filename)));
      return { message, pdf };
    }),
  );
}

const recipients = [
  { name: 'Ana Lima', email: 'ana@example.com' },
  { name: 'Αλέξης Παπαδόπουλος', email: 'alexis@example.com' },
  { name: '  Zoë   Müller ', email: 'ZOE@example.com' },
];

describe('batch flow', () => {
  it('generates, stores and emails every certificate', async () => {
    const created = await createBatch(recipients);
    expect(created.statusCode).toBe(201);
    const { batch } = BatchResponseSchema.parse(created.json());
    expect(batch.counts).toMatchObject({ total: 3, queued: 3 });

    const done = await waitForBatch(batch.id);
    expect(done.status).toBe('COMPLETED');
    expect(done.counts).toEqual({ total: 3, queued: 0, generated: 0, sent: 3, failed: 0 });

    const sent = await readOutbox();
    expect(sent).toHaveLength(3);
    const byRecipient = new Map(sent.map((s) => [s.message.to, s]));

    for (const [address, name] of [
      ['ana@example.com', 'Ana Lima'],
      ['alexis@example.com', 'Αλέξης Παπαδόπουλος'],
      ['zoe@example.com', 'Zoë Müller'], // normalized on the server
    ] as const) {
      const { message, pdf } = byRecipient.get(address)!;
      expect(message.from).toBe(`"Robotics Club" <${env.EMAIL_FROM_ADDRESS}>`);
      expect(message.replyTo).toBe('organizer@example.com');
      expect(message.subject).toBe('Your certificate for Spring Hackathon 2026');
      expect(message.text).toContain(`Hi ${name},`);
      expect(message.text).toMatch(
        /Verify this certificate: http:\/\/localhost:5173\/verify\/CD-[A-Za-z0-9]{10}/,
      );
      expect(message.attachments[0]!.filename).toBe(`Certificate - Spring Hackathon 2026 - ${name}.pdf`);
      // The attachment really is that person's certificate, readable as text.
      expect(await extractText(pdf)).toBe(name);
    }

    const rows = await prisma.certificate.findMany({ where: { batchId: batch.id } });
    for (const row of rows) {
      expect(row).toMatchObject({ status: 'SENT', attempts: 2, error: null });
      expect(row.emailMessageId).toMatch(/^file-/);
      expect(await storage.head(row.pdfKey!)).not.toBeNull();
    }

    const page = CertificatePageSchema.parse(
      (
        await app.inject({ method: 'GET', url: `/api/batches/${batch.id}/certificates?limit=2`, cookies })
      ).json(),
    );
    expect(page.items.map((i) => i.rowIndex)).toEqual([0, 1]);
    expect(page.nextCursor).toBe(1);
    const rest = CertificatePageSchema.parse(
      (
        await app.inject({ method: 'GET', url: `/api/batches/${batch.id}/certificates?cursor=1`, cookies })
      ).json(),
    );
    expect(rest.items.map((i) => i.recipientName)).toEqual(['Zoë Müller']);
    expect(rest.nextCursor).toBeNull();
  });

  it('streams all certificates as a ZIP and signs single downloads', async () => {
    const { batch } = BatchResponseSchema.parse((await createBatch(recipients)).json());
    await waitForBatch(batch.id);

    const zip = await app.inject({ method: 'GET', url: `/api/batches/${batch.id}/zip`, cookies });
    expect(zip.statusCode).toBe(200);
    expect(zip.headers['content-type']).toBe('application/zip');
    expect(zip.rawPayload.subarray(0, 2).toString()).toBe('PK');
    // Stored (uncompressed) entries keep their names readable in the archive bytes.
    const listing = zip.rawPayload.toString('latin1');
    expect(listing.match(/\.pdf/g)?.length).toBeGreaterThanOrEqual(3);

    const [first] = await prisma.certificate.findMany({
      where: { batchId: batch.id },
      orderBy: { rowIndex: 'asc' },
    });
    const download = await app.inject({
      method: 'GET',
      url: `/api/batches/${batch.id}/certificates/${first!.id}/download`,
      cookies,
    });
    expect(download.statusCode).toBe(302);
    expect(download.headers.location).toContain('X-Amz-Signature');
    const file = await fetch(download.headers.location!);
    expect(file.headers.get('content-disposition')).toContain(
      'Certificate - Spring Hackathon 2026 - Ana Lima.pdf',
    );
  });

  it('marks permanent email failures and retries just those on request', async () => {
    email.failures.push(new EmailSendError('Resend responded 422: invalid recipient', false, 422));
    const { batch } = BatchResponseSchema.parse((await createBatch(recipients.slice(0, 2))).json());

    const done = await waitForBatch(batch.id);
    expect(done.status).toBe('COMPLETED_WITH_ERRORS');
    expect(done.counts).toMatchObject({ sent: 1, failed: 1 });
    const failed = await prisma.certificate.findFirstOrThrow({
      where: { batchId: batch.id, status: 'FAILED' },
    });
    expect(failed).toMatchObject({ failedStage: 'SEND' });
    expect(failed.error).toContain('invalid recipient');

    const retry = await app.inject({ method: 'POST', url: `/api/batches/${batch.id}/retry-failed`, cookies });
    expect(retry.json()).toEqual({ retried: 1 });
    const after = await waitForBatch(batch.id);
    expect(after.status).toBe('COMPLETED');
    expect(after.counts).toMatchObject({ sent: 2, failed: 0 });
    // The retry reused the stored PDF: the row was never sent back to the generate stage.
    expect(await prisma.certificate.findUniqueOrThrow({ where: { id: failed.id } })).toMatchObject({
      status: 'SENT',
      pdfKey: failed.pdfKey,
    });
  });
});

describe('send retries', () => {
  it('keeps the row retryable after a transient error and fails it on the last attempt', async () => {
    // Drive the processor directly so the test doesn't wait for pg-boss's retry delay.
    const organizer = await prisma.organizer.create({ data: { email: 'o@example.com' } });
    const template = await prisma.template.create({
      data: {
        organizerId: organizer.id,
        storageKey: 'x',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        status: 'READY',
      },
    });
    const batch = await prisma.batch.create({
      data: {
        organizerId: organizer.id,
        templateId: template.id,
        ...event,
        issueDate: new Date('2026-04-18'),
        layout,
      },
    });
    const pdfKey = `test/${batch.id}.pdf`;
    await storage.putBytes(pdfKey, await makePdf([[100, 100]]), 'application/pdf');
    const cert = await prisma.certificate.create({
      data: {
        id: 'CD-retryTest23',
        batchId: batch.id,
        rowIndex: 0,
        recipientName: 'Ana',
        recipientEmail: 'ana@example.com',
        status: 'GENERATED',
        pdfKey,
      },
    });

    email.failures.push(new EmailSendError('Resend responded 503', true, 503), new Error('socket hang up'));
    await expect(processor.send(cert.id, false)).rejects.toThrow('503');
    expect(await prisma.certificate.findUniqueOrThrow({ where: { id: cert.id } })).toMatchObject({
      status: 'GENERATED',
      attempts: 1,
      error: 'Resend responded 503',
    });

    await processor.send(cert.id, true); // final attempt: recorded, not thrown
    expect(await prisma.certificate.findUniqueOrThrow({ where: { id: cert.id } })).toMatchObject({
      status: 'FAILED',
      failedStage: 'SEND',
    });
    expect((await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).status).toBe(
      'COMPLETED_WITH_ERRORS',
    );
  });
});

describe('batch access control', () => {
  it('rejects rows that still need fixing, without creating anything', async () => {
    const res = await createBatch([...recipients, { name: '', email: 'not-an-email' }]);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'RECIPIENTS_INVALID' } });
    expect(await prisma.batch.count()).toBe(0);
  });

  it("hides other organizers' batches and templates", async () => {
    const { batch } = BatchResponseSchema.parse((await createBatch(recipients.slice(0, 1))).json());
    const intruder = await signIn(app, otpEmail, 'intruder@example.com');

    for (const url of [
      `/api/batches/${batch.id}`,
      `/api/batches/${batch.id}/certificates`,
      `/api/batches/${batch.id}/zip`,
    ]) {
      expect((await app.inject({ method: 'GET', url, cookies: intruder })).statusCode).toBe(404);
    }
    const retry = await app.inject({
      method: 'POST',
      url: `/api/batches/${batch.id}/retry-failed`,
      cookies: intruder,
    });
    expect(retry.statusCode).toBe(404);

    const templateId = (await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).templateId;
    const stolen = await app.inject({
      method: 'POST',
      url: '/api/batches',
      cookies: intruder,
      payload: { templateId, layout, event, recipients },
    });
    expect(stolen.statusCode).toBe(404);
  });
});
