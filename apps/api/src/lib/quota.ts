import { HttpError } from './errors';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of the rolling 24-hour window that per-organizer quotas count over. */
export const quotaWindowStart = (now = new Date()) => new Date(now.getTime() - DAY_MS);

/**
 * Throws a 429 once an organizer has used `limit` of something in the last 24 hours. Per-IP rate
 * limits stop floods; these caps stop one verified account from mass-mailing over a whole day.
 */
export function enforceDailyQuota(used: number, limit: number, what: string): void {
  if (used >= limit) {
    throw new HttpError(
      429,
      'DAILY_LIMIT_REACHED',
      `You’ve reached today’s limit of ${limit} ${what}. Try again tomorrow, or contact us if you need more.`,
    );
  }
}
