import { CertIdSchema, type VerifyResponse } from '@certdrop/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../lib/errors';

const Params = z.object({ certId: z.string().max(64) });

const notFound = () =>
  new HttpError(404, 'CERTIFICATE_NOT_FOUND', 'No certificate matches this ID. Check it and try again.');

/**
 * The only public endpoint with personal data. It returns just what the page shows (never the
 * email address) and answers for issued certificates only: an ID that was created but never
 * generated or sent is indistinguishable from one that doesn't exist.
 */
export const verifyRoutes =
  ({ prisma }: { prisma: PrismaClient }): FastifyPluginAsync =>
  // eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugins are async by contract
  async (app) => {
    // Recipients' names shouldn't end up in search results.
    app.addHook('onSend', async (_request, reply) => {
      reply.header('x-robots-tag', 'noindex, nofollow');
    });

    // IDs are ~58 random bits, so enumeration is hopeless anyway; the limit stops it being tried.
    app.get(
      '/verify/:certId',
      { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
      async (request, reply) => {
        const parsed = CertIdSchema.safeParse(Params.parse(request.params).certId);
        if (!parsed.success) throw notFound();

        const cert = await prisma.certificate.findUnique({
          where: { id: parsed.data },
          select: {
            id: true,
            status: true,
            recipientName: true,
            revokedAt: true,
            batch: { select: { eventName: true, issuerName: true, issueDate: true } },
          },
        });
        if (!cert || (cert.status !== 'GENERATED' && cert.status !== 'SENT')) throw notFound();

        // Short cache: cheap for repeat scans, and a revocation shows up within a minute.
        reply.header('cache-control', 'public, max-age=60');

        const { eventName, issuerName, issueDate } = cert.batch;
        const body: VerifyResponse = cert.revokedAt
          ? {
              status: 'revoked',
              certificate: { id: cert.id, eventName, issuerName, revokedAt: cert.revokedAt.toISOString() },
            }
          : {
              status: 'valid',
              certificate: {
                id: cert.id,
                recipientName: cert.recipientName,
                eventName,
                issuerName,
                issueDate: issueDate.toISOString().slice(0, 10),
              },
            };
        return body;
      },
    );
  };
