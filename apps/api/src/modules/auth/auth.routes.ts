import { OtpRequestBodySchema, OtpVerifyBodySchema, type SessionResponse } from '@certdrop/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { OtpService } from './otp.service';
import type { SessionManager } from './session';

interface AuthRouteDeps {
  otp: OtpService;
  session: SessionManager;
}

// Per-IP limits on top of the per-email limits in OtpService. Requesting a code costs an email
// send, so it is limited more tightly than verifying.
const REQUEST_LIMIT = { max: 10, timeWindow: '15 minutes' };
const VERIFY_LIMIT = { max: 30, timeWindow: '15 minutes' };

export const authRoutes =
  ({ otp, session }: AuthRouteDeps): FastifyPluginAsync =>
  // eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugins are async by contract
  async (app) => {
    // Auth responses are per-user and must never be cached by a proxy or the browser.
    app.addHook('onSend', async (_request, reply) => {
      reply.header('cache-control', 'no-store');
    });

    app.post('/auth/otp/request', { config: { rateLimit: REQUEST_LIMIT } }, async (request) => {
      const { email } = OtpRequestBodySchema.parse(request.body);
      return otp.request(email);
    });

    app.post('/auth/otp/verify', { config: { rateLimit: VERIFY_LIMIT } }, async (request, reply) => {
      const { email, code } = OtpVerifyBodySchema.parse(request.body);
      const organizer = await otp.verify(email, code);
      await session.issue(reply, organizer);
      return { organizer } satisfies SessionResponse;
    });

    app.get('/auth/me', async (request) => {
      return { organizer: await session.read(request) } satisfies SessionResponse;
    });

    app.post('/auth/logout', async (_request, reply) => {
      session.clear(reply);
      return reply.status(204).send();
    });
  };
