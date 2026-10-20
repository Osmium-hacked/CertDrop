import {
  TEMPLATE_MAX_BYTES,
  TemplateMimeTypeSchema,
  TemplateUploadRequestSchema,
  type Template,
  type TemplateUploadResponse,
} from '@certdrop/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '../../lib/errors';
import type { Storage } from '../../lib/storage';
import { currentOrganizer, requireOrganizer } from '../auth/guard';
import type { SessionManager } from '../auth/session';
import { inspectTemplate, TemplateRejectedError } from './inspect';

interface TemplateRouteDeps {
  prisma: PrismaClient;
  storage: Storage;
  session: SessionManager;
}

const UPLOAD_URL_TTL_SECONDS = 5 * 60;
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf' } as const;
const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * Template upload in two calls, so file bytes never pass through the API:
 *   1. POST /uploads/template            → presigned PUT URL bound to the declared type and size
 *   2. (browser PUTs the file to storage)
 *   3. POST /uploads/template/:id/complete → server checks size, magic bytes and structure
 * Only templates that pass step 3 (status READY) can be used in a batch.
 */
export const templateRoutes =
  ({ prisma, storage, session }: TemplateRouteDeps): FastifyPluginAsync =>
  // eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugins are async by contract
  async (app) => {
    app.addHook('preHandler', requireOrganizer(session));

    app.post(
      '/uploads/template',
      { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
      async (request) => {
        const organizer = currentOrganizer(request);
        const { contentType, sizeBytes } = TemplateUploadRequestSchema.parse(request.body);

        const storageKey = `templates/${organizer.id}/${randomUUID()}.${EXTENSIONS[contentType]}`;
        const template = await prisma.template.create({
          data: { organizerId: organizer.id, storageKey, mimeType: contentType, sizeBytes },
        });
        const uploadUrl = await storage.presignPut(
          storageKey,
          contentType,
          sizeBytes,
          UPLOAD_URL_TTL_SECONDS,
        );

        return {
          templateId: template.id,
          uploadUrl,
          headers: { 'Content-Type': contentType },
          expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
        } satisfies TemplateUploadResponse;
      },
    );

    app.post(
      '/uploads/template/:id/complete',
      { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
      async (request, reply) => {
        const organizer = currentOrganizer(request);
        const { id } = ParamsSchema.parse(request.params);

        // Scoped to the caller: another organizer's template ID behaves exactly like a missing one.
        const template = await prisma.template.findFirst({
          where: { id, organizerId: organizer.id, deletedAt: null },
        });
        if (!template) throw new HttpError(404, 'TEMPLATE_NOT_FOUND', 'Template not found.');

        const mimeType = TemplateMimeTypeSchema.parse(template.mimeType);
        if (template.status === 'READY') return { template: toDto(template, mimeType) };

        const object = await storage.head(template.storageKey);
        if (!object) {
          throw new HttpError(409, 'UPLOAD_MISSING', 'The upload didn’t reach storage. Please try again.');
        }

        const reject = async (message: string) => {
          await storage.delete(template.storageKey);
          await prisma.template.delete({ where: { id: template.id } });
          request.log.info({ templateId: template.id, reason: message }, 'template rejected');
          return reply.status(422).send({ error: { code: 'TEMPLATE_INVALID', message } });
        };

        // The signed URL already pins the length; this is a second check that costs nothing.
        if (object.sizeBytes !== template.sizeBytes || object.sizeBytes > TEMPLATE_MAX_BYTES) {
          return reject('The uploaded file doesn’t match what was announced. Please try again.');
        }

        try {
          const info = await inspectTemplate(await storage.getBytes(template.storageKey), mimeType);
          const ready = await prisma.template.update({
            where: { id: template.id },
            data: { status: 'READY', widthPt: info.widthPt, heightPt: info.heightPt },
          });
          return { template: toDto(ready, mimeType) };
        } catch (err) {
          if (err instanceof TemplateRejectedError) return reject(err.message);
          throw err;
        }
      },
    );
  };

function toDto(
  template: { id: string; widthPt: number | null; heightPt: number | null },
  mimeType: Template['mimeType'],
): Template {
  if (template.widthPt === null || template.heightPt === null) {
    throw new Error(`Template ${template.id} is READY but has no page size`);
  }
  return { id: template.id, mimeType, widthPt: template.widthPt, heightPt: template.heightPt };
}
