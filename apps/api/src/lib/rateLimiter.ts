import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Spaces calls evenly: at most `perSecond` acquisitions per second within this process. Used to
 * stay under the email provider's rate limit instead of hitting it and retrying on 429s.
 */
export class IntervalRateLimiter {
  private nextSlot = 0;
  private readonly intervalMs: number;

  constructor(
    perSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.intervalMs = 1000 / perSecond;
  }

  async acquire(): Promise<void> {
    const now = this.now();
    // Reserve the slot synchronously so concurrent callers queue up behind each other.
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.intervalMs;
    if (slot > now) await sleep(slot - now);
  }
}
