import { ApiErrorSchema } from '@certdrop/shared';
import type { z } from 'zod';

/** Thrown for any non-2xx response. `code` and `fields` come from the API's shared error shape. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Treat these extra statuses as success (e.g. 503 from /health still carries a useful body). */
  acceptStatus?: number[];
}

/**
 * Typed fetch for the CertDrop API. Paths are relative to /api, which is same-origin in every
 * environment, so the session cookie is sent automatically. Responses are validated with the
 * shared Zod schema: a contract mismatch fails loudly here instead of deep inside a component.
 */
export async function api<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, acceptStatus = [] } = options;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiRequestError(0, 'NETWORK', 'Could not reach the server. Check your connection.');
  }

  const json: unknown = await res.json().catch(() => null);

  if (!res.ok && !acceptStatus.includes(res.status)) {
    const parsed = ApiErrorSchema.safeParse(json);
    if (parsed.success) {
      const { code, message, fields } = parsed.data.error;
      throw new ApiRequestError(res.status, code, message, fields);
    }
    throw new ApiRequestError(res.status, 'HTTP_ERROR', `Request failed (${res.status}).`);
  }

  return schema.parse(json);
}
