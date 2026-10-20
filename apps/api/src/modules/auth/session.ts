import { OrganizerSchema, type Organizer } from '@certdrop/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE = 'cd_session';
const SESSION_TTL_SECONDS = 2 * 60 * 60;
const ISSUER = 'certdrop';
const AUDIENCE = 'certdrop-api';

/**
 * Stateless sessions: a short-lived HS256 JWT in a cookie.
 *  - HttpOnly: page scripts can't read it, so an XSS bug can't steal it.
 *  - SameSite=Strict: browsers never attach it to cross-site requests. Combined with the API
 *    accepting only JSON bodies, that removes the CSRF surface without extra tokens.
 *  - Path=/api: only sent to the API, not with every page and asset request.
 *  - Secure in production. Browsers only send it over HTTPS.
 * Two hours is plenty for one batch; there is no refresh token, and the organizer simply
 * verifies their email again.
 */
export class SessionManager {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly secureCookie: boolean,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  async issue(reply: FastifyReply, organizer: Organizer): Promise<void> {
    const token = await new SignJWT({ email: organizer.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(organizer.id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
      .sign(this.key);

    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: this.secureCookie,
      sameSite: 'strict',
      path: '/api',
      maxAge: SESSION_TTL_SECONDS,
    });
  }

  /** Returns the signed-in organizer, or null for a missing, expired or tampered cookie. */
  async read(request: FastifyRequest): Promise<Organizer | null> {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      const parsed = OrganizerSchema.safeParse({ id: payload.sub, email: payload.email });
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  clear(reply: FastifyReply): void {
    reply.clearCookie(SESSION_COOKIE, {
      path: '/api',
      httpOnly: true,
      sameSite: 'strict',
      secure: this.secureCookie,
    });
  }
}
