import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../../src/modules/auth/session';
import type { CapturingEmailProvider } from './fakes';

/** Runs the real OTP flow and returns cookies for authenticated `app.inject` calls. */
export async function signIn(
  app: FastifyInstance,
  email: CapturingEmailProvider,
  address: string,
): Promise<Record<string, string>> {
  await app.inject({ method: 'POST', url: '/api/auth/otp/request', payload: { email: address } });
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/otp/verify',
    payload: { email: address, code: email.lastCodeFor(address) },
  });
  const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error(`Sign-in failed for ${address}: ${res.statusCode} ${res.body}`);
  return { [SESSION_COOKIE]: cookie.value };
}
