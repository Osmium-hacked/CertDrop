import type { ApiError } from '@certdrop/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

/** Throw this from route handlers for expected failures; the error handler turns it into JSON. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function body(code: string, message: string, fields?: Record<string, string[]>): ApiError {
  return { error: { code, message, ...(fields && { fields }) } };
}

/** Maps every error to the shared ApiError shape so the web app handles one format. */
export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | Error, request, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send(body(err.code, err.message));
    }

    if (err instanceof ZodError) {
      const fields: Record<string, string[]> = {};
      for (const issue of err.issues) {
        const key = issue.path.join('.') || '_';
        (fields[key] ??= []).push(issue.message);
      }
      return reply.status(400).send(body('VALIDATION_FAILED', 'Some fields are invalid.', fields));
    }

    // Fastify's own 4xx errors (malformed JSON, body too large, rate limited, ...).
    const statusCode = 'statusCode' in err ? err.statusCode : undefined;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      const code = 'code' in err && err.code ? err.code : 'BAD_REQUEST';
      return reply.status(statusCode).send(body(code, err.message));
    }

    request.log.error({ err }, 'unhandled error');
    return reply.status(500).send(body('INTERNAL', 'Something went wrong on our side.'));
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send(body('NOT_FOUND', `No route for ${request.method} ${request.url}`)),
  );
}
