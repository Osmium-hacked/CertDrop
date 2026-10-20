import { describe, expect, it } from 'vitest';
import { signSvix, verifySvixSignature } from '../../src/lib/webhookSignature';

describe('verifySvixSignature', () => {
  // Known-answer example from the Svix documentation, so this checks the scheme itself, not just
  // that signSvix and verifySvixSignature agree with each other.
  const docs = {
    secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
    id: 'msg_p5jXN8AQM9LWM0D4loKWxJek',
    timestamp: '1614265330',
    body: '{"test": 2432232314}',
    signature: 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
  };
  const at = new Date(1614265330 * 1000);

  it('accepts the documented example', () => {
    expect(
      verifySvixSignature(
        docs.secret,
        { id: docs.id, timestamp: docs.timestamp, signature: docs.signature },
        docs.body,
        at,
      ),
    ).toBe(true);
  });

  it('accepts when any of several space-separated signatures matches (key rotation)', () => {
    const signature = `v1,aW52YWxpZA== ${docs.signature}`;
    expect(verifySvixSignature(docs.secret, { ...docs, signature }, docs.body, at)).toBe(true);
  });

  it('rejects a tampered body, a wrong secret and missing headers', () => {
    const headers = { id: docs.id, timestamp: docs.timestamp, signature: docs.signature };
    expect(verifySvixSignature(docs.secret, headers, '{"test": 1}', at)).toBe(false);
    expect(
      verifySvixSignature('whsec_' + Buffer.from('other').toString('base64'), headers, docs.body, at),
    ).toBe(false);
    expect(verifySvixSignature(docs.secret, { ...headers, signature: undefined }, docs.body, at)).toBe(false);
  });

  it('rejects replays outside the five-minute window', () => {
    const headers = { id: docs.id, timestamp: docs.timestamp, signature: docs.signature };
    expect(verifySvixSignature(docs.secret, headers, docs.body, new Date(at.getTime() + 6 * 60_000))).toBe(
      false,
    );
  });

  it('round-trips with signSvix', () => {
    const now = Math.floor(Date.now() / 1000);
    const signature = signSvix(docs.secret, 'msg_1', now, '{"a":1}');
    expect(
      verifySvixSignature(docs.secret, { id: 'msg_1', timestamp: String(now), signature }, '{"a":1}'),
    ).toBe(true);
  });
});
