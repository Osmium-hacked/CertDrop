import { OtpRequestBodySchema, OtpVerifyBodySchema, type SessionResponse } from '@certdrop/shared';
import type { FastifyPluginAsync } from 'fastify';
import { CaptchaUnavailableError, type CaptchaVerifier } from '../../lib/captcha';
import { HttpError } from '../../lib/errors';
import type { OtpService } from './otp.service';
import type { SessionManager } from './session';

interface AuthRouteDeps {
  otp: OtpService;
  session: SessionManager;
  captcha: CaptchaVerifier;
}

// Per-IP limits on top of the per-email limits in OtpService. Requesting a code costs an email
// send, so it is limited more tightly than verifying.
const REQUEST_LIMIT = { max: 10, timeWindow: '15 minutes' };
const VERIFY_LIMIT = { max: 30, timeWindow: '15 minutes' };

export const authRoutes =
  ({ otp, session, captcha }: AuthRouteDeps): FastifyPluginAsync =>
  // eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugins are async by contract
  async (app) => {
    // Auth responses are per-user and must never be cached by a proxy or the browser.
    app.addHook('onSend', async (_request, reply) => {
      reply.header('cache-control', 'no-store');
    });

    app.post('/auth/otp/request', { config: { rateLimit: REQUEST_LIMIT } }, async (request) => {
      const { email, captchaToken } = OtpRequestBodySchema.parse(request.body);
      // Checked before anything touches the database or sends mail.
      let human: boolean;
      try {
        human = await captcha.verify(captchaToken, request.ip);
      } catch (err) {
        if (!(err instanceof CaptchaUnavailableError)) throw err;
        request.log.error({ err }, 'captcha verification unavailable');
        throw new HttpError(
          503,
          'CAPTCHA_UNAVAILABLE',
          'We couldn’t run the human check. Please try again shortly.',
        );
      }
      if (!human) {
        throw new HttpError(403, 'CAPTCHA_FAILED', 'Please complete the human check and try again.');
      }
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
