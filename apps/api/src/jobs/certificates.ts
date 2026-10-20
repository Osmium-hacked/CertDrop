import { LayoutSchema, TemplateMimeTypeSchema, verifyUrl, type FailedStage } from '@certdrop/shared';
import type { PrismaClient } from '@prisma/client';
import { fromPrisma, type PgBoss } from 'pg-boss';
import type { Env } from '../config/env';
import { EmailSendError, type EmailProvider } from '../email';
import { certificateEmail } from '../email/templates/certificate';
import type { Logger } from '../lib/logger';
import type { IntervalRateLimiter } from '../lib/rateLimiter';
import type { Storage } from '../lib/storage';
import type { FontLibrary } from '../pdf/fonts';
import { prepareBasePdf, renderCertificate } from '../pdf/render';
import {
  GENERATE_QUEUE,
  QUEUE_CONFIG,
  SEND_QUEUE,
  type CertificateJob,
  type CertificateQueue,
} from './queues';

export interface CertificateProcessorDeps {
  prisma: PrismaClient;
  storage: Storage;
  email: EmailProvider;
  fonts: FontLibrary;
  queue: CertificateQueue;
  emailLimiter: IntervalRateLimiter;
  publicAppUrl: string;
  logger: Logger;
  now?: () => Date;
}

/** Templates whose base PDF is kept in memory; a worker rarely serves more than a few batches at once. */
const BASE_PDF_CACHE_SIZE = 20;

const describe = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500);

/**
 * The two pipeline stages. Each method is safe to run more than once for the same certificate
 * (pg-boss delivers at-least-once): state changes are conditional updates, so a duplicate or
 * late job finds the row already moved on and does nothing.
 *
 * Errors never escape except to request a retry: on the final attempt, or for errors that can't
 * succeed on retry, the row is marked FAILED with the reason and the job completes normally.
 */
export class CertificateProcessor {
  private readonly basePdfs = new Map<string, Promise<Uint8Array>>();

  constructor(private readonly deps: CertificateProcessorDeps) {}

  async generate(certificateId: string, finalAttempt: boolean): Promise<void> {
    const { prisma, storage, fonts, queue, logger } = this.deps;
    const cert = await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: { batch: { include: { template: true } } },
    });
    if (!cert || cert.status !== 'QUEUED') return;
    const { batch } = cert;

    try {
      const { pdf, fit } = await renderCertificate(
        {
          basePdf: await this.basePdfFor(batch.template),
          layout: LayoutSchema.parse(batch.layout),
          recipientName: cert.recipientName,
          certId: cert.id,
          verifyUrl: verifyUrl(this.deps.publicAppUrl, cert.id),
          eventName: batch.eventName,
          issuerName: batch.issuerName,
        },
        fonts,
      );
      const pdfKey = `certificates/${batch.id}/${cert.id}.pdf`;
      await storage.putBytes(pdfKey, pdf, 'application/pdf');

      // Status change and the follow-up send job commit together.
      await prisma.$transaction(async (tx) => {
        const moved = await tx.certificate.updateMany({
          where: { id: cert.id, status: 'QUEUED' },
          data: { status: 'GENERATED', pdfKey, error: null, failedStage: null, attempts: { increment: 1 } },
        });
        if (moved.count === 1) await queue.enqueueSend([cert.id], fromPrisma(tx));
      });
      logger.debug(
        { certificateId: cert.id, fontSize: fit.fontSize, lines: fit.lines.length },
        'certificate generated',
      );
    } catch (err) {
      logger.warn({ err, certificateId: cert.id, finalAttempt }, 'certificate generation failed');
      if (finalAttempt)
        return this.fail(cert.id, batch.id, 'GENERATE', `Couldn’t create the PDF: ${describe(err)}`);
      await prisma.certificate.update({
        where: { id: cert.id },
        data: { attempts: { increment: 1 }, error: describe(err) },
      });
      throw err; // pg-boss retries with backoff
    }
  }

  async send(certificateId: string, finalAttempt: boolean): Promise<void> {
    const { prisma, storage, email, emailLimiter, logger } = this.deps;
    const now = this.deps.now ?? (() => new Date());
    const cert = await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: { batch: { include: { organizer: true } } },
    });
    if (!cert || cert.status !== 'GENERATED' || !cert.pdfKey) return;
    const { batch } = cert;

    try {
      const pdf = await storage.getBytes(cert.pdfKey);
      await emailLimiter.acquire();
      const { messageId } = await email.send(
        certificateEmail({
          to: cert.recipientEmail,
          recipientName: cert.recipientName,
          eventName: batch.eventName,
          issuerName: batch.issuerName,
          organizerEmail: batch.organizer.email,
          subjectTemplate: batch.emailSubject,
          messageTemplate: batch.emailMessage,
          verifyUrl: verifyUrl(this.deps.publicAppUrl, cert.id),
          certId: cert.id,
          pdf,
        }),
      );
      await prisma.certificate.updateMany({
        where: { id: cert.id, status: 'GENERATED' },
        data: {
          status: 'SENT',
          emailMessageId: messageId,
          sentAt: now(),
          error: null,
          failedStage: null,
          attempts: { increment: 1 },
        },
      });
      await this.finishIfDone(batch.id);
    } catch (err) {
      // A 4xx from the provider (bad address, rejected content) won't change on retry.
      const permanent = err instanceof EmailSendError && !err.retryable;
      logger.warn({ err, certificateId: cert.id, permanent, finalAttempt }, 'certificate email failed');
      if (permanent || finalAttempt)
        return this.fail(cert.id, batch.id, 'SEND', `Couldn’t send the email: ${describe(err)}`);
      await prisma.certificate.update({
        where: { id: cert.id },
        data: { attempts: { increment: 1 }, error: describe(err) },
      });
      throw err;
    }
  }

  /** The template as a ready-to-draw one-page PDF, built once per template and cached. */
  private basePdfFor(template: {
    id: string;
    storageKey: string;
    mimeType: string;
    widthPt: number | null;
    heightPt: number | null;
  }) {
    let entry = this.basePdfs.get(template.id);
    if (!entry) {
      entry = (async () => {
        const bytes = await this.deps.storage.getBytes(template.storageKey);
        return prepareBasePdf(bytes, TemplateMimeTypeSchema.parse(template.mimeType), {
          widthPt: template.widthPt ?? 0,
          heightPt: template.heightPt ?? 0,
        });
      })();
      entry.catch(() => this.basePdfs.delete(template.id));
      this.basePdfs.set(template.id, entry);
      // Map iteration order is insertion order, so the first key is the oldest.
      if (this.basePdfs.size > BASE_PDF_CACHE_SIZE) this.basePdfs.delete(this.basePdfs.keys().next().value!);
    }
    return entry;
  }

  private async fail(
    certificateId: string,
    batchId: string,
    stage: FailedStage,
    error: string,
  ): Promise<void> {
    await this.deps.prisma.certificate.updateMany({
      where: { id: certificateId, status: { in: ['QUEUED', 'GENERATED'] } },
      data: { status: 'FAILED', failedStage: stage, error, attempts: { increment: 1 } },
    });
    await this.finishIfDone(batchId);
  }

  /** Marks the batch finished once no certificate is still waiting to be generated or sent. */
  private async finishIfDone(batchId: string): Promise<void> {
    const { prisma } = this.deps;
    const pending = await prisma.certificate.count({
      where: { batchId, status: { in: ['QUEUED', 'GENERATED'] } },
    });
    if (pending > 0) return;
    const failed = await prisma.certificate.count({ where: { batchId, status: 'FAILED' } });
    await prisma.batch.updateMany({
      where: { id: batchId, status: 'PROCESSING' },
      data: { status: failed > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED' },
    });
  }
}

/** Wires the processor to pg-boss. pg-boss's retryCount starts at 0 for the first attempt. */
export async function registerCertificateWorkers(
  boss: PgBoss,
  processor: CertificateProcessor,
  env: Pick<Env, 'GENERATE_CONCURRENCY'>,
  options: { pollingIntervalSeconds?: number } = {},
): Promise<void> {
  const pollingIntervalSeconds = options.pollingIntervalSeconds ?? 1;

  await boss.work<CertificateJob>(
    GENERATE_QUEUE,
    { batchSize: 1, localConcurrency: env.GENERATE_CONCURRENCY, pollingIntervalSeconds },
    async ([job]) => {
      if (!job) return;
      await processor.generate(
        job.data.certificateId,
        job.retryCount >= QUEUE_CONFIG[GENERATE_QUEUE].retryLimit,
      );
    },
  );

  // Sends are paced by the rate limiter, so two in flight is enough to hide network latency.
  await boss.work<CertificateJob>(
    SEND_QUEUE,
    { batchSize: 1, localConcurrency: 2, pollingIntervalSeconds },
    async ([job]) => {
      if (!job) return;
      await processor.send(job.data.certificateId, job.retryCount >= QUEUE_CONFIG[SEND_QUEUE].retryLimit);
    },
  );
}
