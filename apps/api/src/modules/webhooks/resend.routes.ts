import type { DeliveryStatus, PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../lib/errors';
import { verifySvixSignature } from '../../lib/webhookSignature';

const EventSchema = z.object({
  type: z.string(),
  data: z.object({ email_id: z.string() }).passthrough(),
});

const STATUS_FOR_EVENT: Record<string, DeliveryStatus> = {
  'email.delivered': 'DELIVERED',
  'email.bounced': 'BOUNCED',
  'email.complained': 'COMPLAINED',
};

/**
 * Statuses only move forward (delivered → bounced → complained): webhooks can arrive out of
 * order, and a late "delivered" must not hide a bounce.
 */
const MAY_REPLACE: Record<DeliveryStatus, Array<DeliveryStatus | null>> = {
  DELIVERED: [null],
  BOUNCED: [null, 'DELIVERED'],
  COMPLAINED: [null, 'DELIVERED', 'BOUNCED'],
};

/**
 * POST /webhooks/resend: delivery, bounce and complaint events, matched to certificates by the
 * provider message ID stored when each email was sent.
 */
export const resendWebhookRoutes =
  ({ prisma, secret }: { prisma: PrismaClient; secret: string | undefined }): FastifyPluginAsync =>
  // eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugins are async by contract
  async (app) => {
    // Signatures cover the exact bytes received, so this route (only) keeps the body as a string.
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) =>
      done(null, body),
    );

    app.post('/webhooks/resend', async (request) => {
      if (!secret) throw new HttpError(404, 'NOT_FOUND', 'Webhook not configured.');
      const raw = typeof request.body === 'string' ? request.body : '';
      const header = (name: string) => {
        const value = request.headers[name];
        return Array.isArray(value) ? value[0] : value;
      };
      const valid = verifySvixSignature(
        secret,
        { id: header('svix-id'), timestamp: header('svix-timestamp'), signature: header('svix-signature') },
        raw,
      );
      if (!valid) throw new HttpError(401, 'INVALID_SIGNATURE', 'Invalid webhook signature.');

      const event = EventSchema.safeParse(JSON.parse(raw) as unknown);
      // Acknowledge anything we don't track so the provider doesn't keep retrying it.
      if (!event.success) return { received: true };
      const status = STATUS_FOR_EVENT[event.data.type];
      if (!status) return { received: true };

      const replaceable = MAY_REPLACE[status];
      const updated = await prisma.certificate.updateMany({
        where: {
          emailMessageId: event.data.data.email_id,
          OR: [
            ...(replaceable.includes(null) ? [{ deliveryStatus: null }] : []),
            { deliveryStatus: { in: replaceable.filter((s): s is DeliveryStatus => s !== null) } },
          ],
        },
        data: { deliveryStatus: status },
      });
      request.log.info({ type: event.data.type, matched: updated.count }, 'email webhook processed');
      return { received: true };
    });
  };
