import type { EmailMessage, EmailProvider, SendResult } from '../../src/email';
import type { Storage } from '../../src/lib/storage';

/** Records every email instead of sending it. Set `failNext` to simulate a provider outage. */
export class CapturingEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  failNext = false;

  send(message: EmailMessage): Promise<SendResult> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('simulated provider outage'));
    }
    this.sent.push(message);
    return Promise.resolve({ messageId: `test-${this.sent.length}` });
  }

  /** The 6-digit code from the most recent email to `to`. */
  lastCodeFor(to: string): string {
    const message = [...this.sent].reverse().find((m) => m.to === to);
    const code = message?.text.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error(`No OTP email captured for ${to}`);
    return code;
  }
}

/** In-memory object store for unit tests. `pingError` simulates an unreachable bucket. */
export class InMemoryStorage implements Storage {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  constructor(private readonly pingError?: Error) {}

  ping(): Promise<void> {
    return this.pingError ? Promise.reject(this.pingError) : Promise.resolve();
  }
  presignPut(key: string): Promise<string> {
    return Promise.resolve(`https://storage.test/${encodeURIComponent(key)}?signature=fake`);
  }
  head(key: string) {
    const object = this.objects.get(key);
    return Promise.resolve(
      object ? { sizeBytes: object.bytes.length, contentType: object.contentType } : null,
    );
  }
  getBytes(key: string): Promise<Uint8Array> {
    const object = this.objects.get(key);
    return object ? Promise.resolve(object.bytes) : Promise.reject(new Error(`No object ${key}`));
  }
  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}

export const okStorage: Storage = new InMemoryStorage();

/** A clock tests can move forward. */
export class TestClock {
  private current: Date;
  constructor(start = '2026-01-15T10:00:00.000Z') {
    this.current = new Date(start);
  }
  now = (): Date => new Date(this.current);
  advance(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}
