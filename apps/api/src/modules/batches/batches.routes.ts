import {
  BatchCreateSchema,
  CertIdSchema,
  CertificateListQuerySchema,
  validateRows,
  type BatchCounts,
  type BatchSummary,
  type CertificatePage,
  type CertificateStatus,
} from '@certdrop/shared';
import type { PrismaClient } from '@prisma/client';
import { ZipArchive } from 'archiver';
import type { FastifyPluginAsync } from 'fastify';
import { once } from 'node:events';
import { fromPrisma } from 'pg-boss';
import { z } from 'zod';
import { certificateFileName } from '../../email/templates/certificate';
import { generateCertId } from '../../lib/certId';
import { HttpError } from '../../lib/errors';
import { enforceDailyQuota, quotaWindowStart } from '../../lib/quota';
import type { Storage } from '../../lib/storage';
import type { CertificateQueue } from '../../jobs/queues';
import { currentOrganizer, requireOrganizer } from '../auth/guard';
import type { SessionManager } from '../auth/session';

interface BatchRouteDeps {
  prisma: PrismaClient;
  storage: Storage;
  queue: CertificateQueue;
  session: SessionManager;
  batchesPerDay: number;
}

const IdParams = z.object({ id: z.string().min(1).max(64) });
const CertParams = IdParams.extend({ certId: CertIdSchema });
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

function toSummary(
  batch: {
    id: string;
    status: BatchSummary['status'];
    eventName: string;
    issuerName: string;
    createdAt: Date;
    filesDeletedAt: Date | null;
  },
  counts: BatchCounts,
): BatchSummary {
  return {
    id: batch.id,
    status: batch.status,
    eventName: batch.eventName,
    issuerName: batch.issuerName,
    createdAt: batch.createdAt.toISOString(),
    filesDeletedAt: batch.filesDeletedAt?.toISOString() ?? null,
    counts,
  };
}

/** After the retention cleanup the PDFs are gone, but verification still works. */
function assertFilesAvailable(batch: { filesDeletedAt: Date | null }): void {
  if (batch.filesDeletedAt) {
    throw new HttpError(
      410,
      'FILES_EXPIRED',
      'Certificate files are deleted 30 days after sending. Verification links keep working.',
    );
  }
}

export const batchRoutes =
  ({ prisma, storage, queue, session, batchesPerDay }: BatchRouteDeps): FastifyPluginAsync =>
  // eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugins are async by contract
  async (app) => {
    app.addHook('preHandler', requireOrganizer(session));

    /** A batch belonging to the caller. Anyone else's batch ID behaves exactly like a missing one. */
    async function ownBatch(id: string, organizerId: string) {
      const batch = await prisma.batch.findFirst({ where: { id, organizerId } });
      if (!batch) throw new HttpError(404, 'BATCH_NOT_FOUND', 'Batch not found.');
      return batch;
    }

    async function countsFor(batchId: string): Promise<BatchCounts> {
      const groups = await prisma.certificate.groupBy({ by: ['status'], where: { batchId }, _count: true });
      const count = (status: CertificateStatus) => groups.find((g) => g.status === status)?._count ?? 0;
      const counts = {
        queued: count('QUEUED'),
        generated: count('GENERATED'),
        sent: count('SENT'),
        failed: count('FAILED'),
      };
      return { ...counts, total: counts.queued + counts.generated + counts.sent + counts.failed };
    }

    app.post(
      '/batches',
      { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
      async (request, reply) => {
        const organizer = currentOrganizer(request);
        const body = BatchCreateSchema.parse(request.body);
        enforceDailyQuota(
          await prisma.batch.count({
            where: { organizerId: organizer.id, createdAt: { gt: quotaWindowStart() } },
          }),
          batchesPerDay,
          'batches',
        );

        const template = await prisma.template.findFirst({
          where: { id: body.templateId, organizerId: organizer.id, deletedAt: null },
        });
        if (!template) throw new HttpError(404, 'TEMPLATE_NOT_FOUND', 'Template not found. Upload it again.');
        if (template.status !== 'READY') {
          throw new HttpError(409, 'TEMPLATE_NOT_READY', 'The template is still being checked. Try again.');
        }

        // Never trust the browser's validation: re-check every row with the same shared rules.
        const { valid, invalid } = validateRows(body.recipients, {
          name: 'name',
          lastName: null,
          email: 'email',
        });
        if (invalid.length > 0) {
          throw new HttpError(
            400,
            'RECIPIENTS_INVALID',
            `${invalid.length} ${invalid.length === 1 ? 'participant needs' : 'participants need'} fixing before sending.`,
          );
        }

        const certificates = valid.map((row, rowIndex) => ({
          id: generateCertId(),
          rowIndex,
          recipientName: row.name,
          recipientEmail: row.email,
        }));

        // Batch, certificate rows and generate jobs commit together, or not at all.
        const batch = await prisma.$transaction(
          async (tx) => {
            const created = await tx.batch.create({
              data: {
                organizerId: organizer.id,
                templateId: template.id,
                eventName: body.event.eventName,
                issuerName: body.event.issuerName,
                issueDate: new Date(`${body.event.issueDate}T00:00:00.000Z`),
                emailSubject: body.event.emailSubject,
                emailMessage: body.event.emailMessage,
                layout: body.layout,
              },
            });
            await tx.certificate.createMany({
              data: certificates.map((c) => ({ ...c, batchId: created.id })),
            });
            await queue.enqueueGenerate(
              certificates.map((c) => c.id),
              fromPrisma(tx),
            );
            return created;
          },
          { timeout: 30_000 },
        );

        request.log.info({ batchId: batch.id, certificates: certificates.length }, 'batch created');
        return reply.status(201).send({
          batch: toSummary(batch, {
            total: certificates.length,
            queued: certificates.length,
            generated: 0,
            sent: 0,
            failed: 0,
          }),
        });
      },
    );

    app.get('/batches/:id', async (request) => {
      const { id } = IdParams.parse(request.params);
      const batch = await ownBatch(id, currentOrganizer(request).id);
      return { batch: toSummary(batch, await countsFor(batch.id)) };
    });

    app.get('/batches/:id/certificates', async (request) => {
      const { id } = IdParams.parse(request.params);
      const { status, cursor, limit } = CertificateListQuerySchema.parse(request.query);
      await ownBatch(id, currentOrganizer(request).id);

      // Keyset pagination on rowIndex: stable while statuses change underneath, unlike offsets.
      const rows = await prisma.certificate.findMany({
        where: {
          batchId: id,
          ...(status && { status }),
          ...(cursor !== undefined && { rowIndex: { gt: cursor } }),
        },
        orderBy: { rowIndex: 'asc' },
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      return {
        items: page.map((c) => ({
          id: c.id,
          rowIndex: c.rowIndex,
          recipientName: c.recipientName,
          recipientEmail: c.recipientEmail,
          status: c.status,
          error: c.error,
          sentAt: c.sentAt?.toISOString() ?? null,
          revokedAt: c.revokedAt?.toISOString() ?? null,
          deliveryStatus: c.deliveryStatus,
        })),
        nextCursor: rows.length > limit ? (page.at(-1)?.rowIndex ?? null) : null,
      } satisfies CertificatePage;
    });

    app.post('/batches/:id/retry-failed', async (request) => {
      const { id } = IdParams.parse(request.params);
      assertFilesAvailable(await ownBatch(id, currentOrganizer(request).id));

      const retried = await prisma.$transaction(async (tx) => {
        const failed = await tx.certificate.findMany({ where: { batchId: id, status: 'FAILED' } });
        // Retry only the stage that failed: a failed send reuses the PDF already in storage.
        const toSend = failed.filter((c) => c.failedStage === 'SEND' && c.pdfKey).map((c) => c.id);
        const toGenerate = failed.filter((c) => !toSend.includes(c.id)).map((c) => c.id);

        const reset = { error: null, failedStage: null };
        if (toGenerate.length) {
          await tx.certificate.updateMany({
            where: { id: { in: toGenerate } },
            data: { ...reset, status: 'QUEUED' },
          });
          await queue.enqueueGenerate(toGenerate, fromPrisma(tx));
        }
        if (toSend.length) {
          await tx.certificate.updateMany({
            where: { id: { in: toSend } },
            data: { ...reset, status: 'GENERATED' },
          });
          await queue.enqueueSend(toSend, fromPrisma(tx));
        }
        if (failed.length) await tx.batch.update({ where: { id }, data: { status: 'PROCESSING' } });
        return failed.length;
      });
      return { retried };
    });

    /**
     * Revoking withdraws a certificate (wrong person, issued by mistake): the verify page then
     * says so instead of confirming it. Restoring undoes that. Only issued certificates qualify.
     */
    for (const action of ['revoke', 'restore'] as const) {
      app.post(`/batches/:id/certificates/:certId/${action}`, async (request) => {
        const { id, certId } = CertParams.parse(request.params);
        await ownBatch(id, currentOrganizer(request).id);
        const cert = await prisma.certificate.findFirst({
          where: { id: certId, batchId: id, status: { in: ['GENERATED', 'SENT'] } },
          select: { revokedAt: true },
        });
        if (!cert) {
          throw new HttpError(
            404,
            'CERTIFICATE_NOT_FOUND',
            'Only issued certificates can be revoked or restored.',
          );
        }
        // Revoking an already-revoked certificate keeps the original revocation time.
        if (action === 'revoke' && cert.revokedAt) return { revokedAt: cert.revokedAt.toISOString() };

        const revokedAt = action === 'revoke' ? new Date() : null;
        await prisma.certificate.update({ where: { id: certId }, data: { revokedAt } });
        request.log.info({ batchId: id, certificateId: certId, action }, 'certificate revocation changed');
        return { revokedAt: revokedAt?.toISOString() ?? null };
      });
    }

    app.get('/batches/:id/certificates/:certId/download', async (request, reply) => {
      const { id, certId } = CertParams.parse(request.params);
      const batch = await ownBatch(id, currentOrganizer(request).id);
      assertFilesAvailable(batch);
      const cert = await prisma.certificate.findFirst({ where: { id: certId, batchId: batch.id } });
      if (!cert?.pdfKey)
        throw new HttpError(404, 'CERTIFICATE_NOT_READY', 'This certificate isn’t ready yet.');
      const url = await storage.presignGet(
        cert.pdfKey,
        DOWNLOAD_URL_TTL_SECONDS,
        certificateFileName(batch.eventName, cert.recipientName),
      );
      return reply.redirect(url, 302);
    });

    app.get('/batches/:id/zip', async (request, reply) => {
      const { id } = IdParams.parse(request.params);
      const batch = await ownBatch(id, currentOrganizer(request).id);
      assertFilesAvailable(batch);
      const certs = await prisma.certificate.findMany({
        where: { batchId: batch.id, pdfKey: { not: null }, status: { in: ['GENERATED', 'SENT'] } },
        orderBy: { rowIndex: 'asc' },
        select: { id: true, recipientName: true, pdfKey: true },
      });
      if (certs.length === 0)
        throw new HttpError(409, 'NOTHING_TO_DOWNLOAD', 'No certificates have been generated yet.');

      // PDFs are already compressed, so store them as-is: same size, far less CPU.
      const archive = new ZipArchive({ store: true });
      archive.on('warning', (err) => request.log.warn({ err }, 'zip warning'));

      // Stream one PDF at a time, waiting for each entry to finish before opening the next
      // storage request: memory and open connections stay flat even for 1,000 certificates.
      void (async () => {
        try {
          for (const cert of certs) {
            const entryDone = once(archive, 'entry');
            archive.append(await storage.getStream(cert.pdfKey!), {
              name: `${certificateFileName(batch.eventName, cert.recipientName).replace(/\.pdf$/, '')} (${cert.id}).pdf`,
            });
            await entryDone;
          }
          await archive.finalize();
        } catch (err) {
          request.log.error({ err, batchId: batch.id }, 'zip stream failed');
          archive.abort();
        }
      })();

      const zipName = `Certificates - ${batch.eventName}.zip`.replace(/[\\/:*?"<>|]/g, '');
      return reply
        .header('content-type', 'application/zip')
        .header(
          'content-disposition',
          `attachment; filename="${zipName.replace(/[^\x20-\x7e]/g, '')}"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
        )
        .header('cache-control', 'no-store')
        .send(archive);
    });
  };
