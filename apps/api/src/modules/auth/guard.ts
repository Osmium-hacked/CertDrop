import type { Organizer } from '@certdrop/shared';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { HttpError } from '../../lib/errors';
import type { SessionManager } from './session';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by requireOrganizer; null on routes that don't use it. */
    organizer: Organizer | null;
  }
}

/** preHandler for routes that need a verified organizer. Responds 401 otherwise. */
export function requireOrganizer(session: SessionManager): preHandlerAsyncHookHandler {
  return async (request) => {
    const organizer = await session.read(request);
    if (!organizer) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Your session has expired. Verify your email to continue.');
    }
    request.organizer = organizer;
  };
}

/** The organizer on a route protected by requireOrganizer. */
export function currentOrganizer(request: FastifyRequest): Organizer {
  if (!request.organizer) throw new Error('currentOrganizer() used on a route without requireOrganizer');
  return request.organizer;
}
