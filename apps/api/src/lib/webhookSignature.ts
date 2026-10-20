import { createHmac, timingSafeEqual } from 'node:crypto';

/** Reject deliveries whose timestamp is further than this from now (replay protection). */
const TOLERANCE_SECONDS = 5 * 60;

export interface SvixHeaders {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
}

/**
 * Verifies a webhook signed with the Svix scheme, which Resend uses.
 * signature = base64(HMAC-SHA256(base64decode(secret without "whsec_"), `${id}.${timestamp}.${rawBody}`)),
 * sent as one or more space-separated "v1,<signature>" entries (several during key rotation).
 * The raw body must be the exact bytes received: re-serialized JSON would not match.
 */
export function verifySvixSignature(
  secret: string,
  headers: SvixHeaders,
  rawBody: string,
  now: Date = new Date(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  const sentAt = Number(timestamp);
  if (!Number.isInteger(sentAt) || Math.abs(now.getTime() / 1000 - sentAt) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();

  return signature.split(' ').some((entry) => {
    const [version, value] = entry.split(',', 2);
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Signs a payload the way Svix does. Used by tests and handy for local webhook testing. */
export function signSvix(secret: string, id: string, timestamp: number, rawBody: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64')}`;
}
