import { pino, type Logger } from 'pino';
import type { Env } from '../config/env';

export type { Logger };

/**
 * Paths that must never reach the logs. Code should log hashed or masked identifiers
 * (see maskEmail) instead of raw addresses; redaction is the safety net, not the plan.
 */
const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.email',
  '*.recipientEmail',
  '*.code',
  '*.otp',
  '*.password',
  '*.token',
];

export function createLogger(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>, name: string): Logger {
  return pino({
    name,
    level: env.LOG_LEVEL,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    // Human-readable logs locally; newline-delimited JSON everywhere else for log aggregators.
    ...(env.NODE_ENV === 'development' && {
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
      },
    }),
  });
}

/** "jane.doe@example.com" → "ja***@example.com". Enough to debug, not enough to harvest. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}
