import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../lib/logger';
import type { Storage } from '../lib/storage';

export const CLEANUP_QUEUE = 'maintenance-cleanup';
/** Daily at 03:00 UTC, a quiet hour for most organizers. */
export const CLEANUP_CRON = '0 3 * * *';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Batches handled per run, so one run never holds a huge transaction; the next run continues. */
const BATCHES_PER_RUN = 200;

export interface CleanupResult {
  batches: number;
  certificateFiles: number;
  templates: number;
  abandonedUploads: number;
  otpCodes: number;
}

/**
 * Data minimisation. Files are deleted after the retention period; the database rows stay, so
 * every verification link keeps working forever. Safe to run any number of times.
 *
 *  - Generated PDFs of batches older than the retention period
 *  - Uploaded templates older than the retention period
 *  - Uploads that were never completed (older than a day)
 *  - One-time codes older than a day (used or not; each lives 10 minutes)
 */
export class CleanupService {
  constructor(
    private readonly deps: { prisma: PrismaClient; storage: Storage; logger: Logger; retentionDays: number },
  ) {}

  async run(now = new Date()): Promise<CleanupResult> {
    const { prisma, storage, logger } = this.deps;
    const cutoff = new Date(now.getTime() - this.deps.retentionDays * DAY_MS);
    const dayAgo = new Date(now.getTime() - DAY_MS);
    const result: CleanupResult = {
      batches: 0,
      certificateFiles: 0,
      templates: 0,
      abandonedUploads: 0,
      otpCodes: 0,
    };

    const batches = await prisma.batch.findMany({
      where: { createdAt: { lt: cutoff }, filesDeletedAt: null, status: { not: 'PROCESSING' } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: BATCHES_PER_RUN,
    });
    for (const batch of batches) {
      const files = await prisma.certificate.findMany({
        where: { batchId: batch.id, pdfKey: { not: null } },
        select: { pdfKey: true },
      });
      // Storage first: if it fails, the rows still point at the files and the next run retries.
      await storage.deleteMany(files.map((f) => f.pdfKey!));
      await prisma.$transaction([
        prisma.certificate.updateMany({ where: { batchId: batch.id }, data: { pdfKey: null } }),
        prisma.batch.update({ where: { id: batch.id }, data: { filesDeletedAt: now } }),
      ]);
      result.batches += 1;
      result.certificateFiles += files.length;
    }

    const templates = await prisma.template.findMany({
      where: { createdAt: { lt: cutoff }, deletedAt: null, status: 'READY' },
      select: { id: true, storageKey: true },
    });
    if (templates.length) {
      await storage.deleteMany(templates.map((t) => t.storageKey));
      await prisma.template.updateMany({
        where: { id: { in: templates.map((t) => t.id) } },
        data: { deletedAt: now },
      });
      result.templates = templates.length;
    }

    // Presigned URL issued but never completed: the object may or may not exist.
    const abandoned = await prisma.template.findMany({
      where: { status: 'PENDING', createdAt: { lt: dayAgo } },
      select: { id: true, storageKey: true },
    });
    if (abandoned.length) {
      await storage.deleteMany(abandoned.map((t) => t.storageKey));
      await prisma.template.deleteMany({ where: { id: { in: abandoned.map((t) => t.id) } } });
      result.abandonedUploads = abandoned.length;
    }

    result.otpCodes = (await prisma.otpCode.deleteMany({ where: { createdAt: { lt: dayAgo } } })).count;

    logger.info({ ...result, retentionDays: this.deps.retentionDays }, 'cleanup finished');
    return result;
  }
}
