import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailSendError, type EmailMessage } from '../../src/email';
import { buildMimeMessage, encodeHeader, GmailEmailProvider } from '../../src/email/gmail.provider';

const message: EmailMessage = {
  to: 'zoe@example.com',
  fromName: 'Robotics Club, Pune',
  replyTo: 'organizer@example.com',
  subject: 'Your certificate, Zoë Müller',
  text: 'Hi Zoë, here it is.',
  html: '<p>Hi Zoë, here it is.</p>',
  attachments: [
    {
      filename: 'Certificate - Zoë.pdf',
      content: Buffer.from('%PDF-1.7 test'),
      contentType: 'application/pdf',
    },
  ],
};

/** Decodes RFC 2047 encoded words back to text. */
const decodeHeader = (value: string) =>
  value
    .replace(/\r\n /g, '')
    .replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, b64: string) => Buffer.from(b64, 'base64').toString('utf8'));

/** Every base64 body in the message, decoded. */
const decodedParts = (mime: string) =>
  [...mime.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n\r\n/g)].map(
    ([, b64]) => Buffer.from(b64!.replace(/\r\n/g, ''), 'base64').toString('utf8'),
  );

describe('encodeHeader', () => {
  it('leaves plain ASCII alone', () => {
    expect(encodeHeader('Your certificate')).toBe('Your certificate');
  });

  it('encodes other text as short words that decode back exactly', () => {
    const subject = 'Сертификат участника: Αλέξης Παπαδόπουλος — Hackathon Pune 2026 🎉';
    const encoded = encodeHeader(subject);
    for (const word of encoded.split('\r\n ')) expect(word.length).toBeLessThanOrEqual(75);
    expect(decodeHeader(encoded)).toBe(subject);
  });

  it('removes line breaks', () => {
    expect(encodeHeader('Hi\r\nBcc: victim@x.dev')).toBe('HiBcc: victim@x.dev');
  });
});

describe('buildMimeMessage', () => {
  it('builds headers, both bodies and the attachment', () => {
    const mime = buildMimeMessage(message, 'certdrop.app@gmail.com');
    const [head] = mime.split('\r\n\r\n');

    expect(head).toContain('From: "Robotics Club, Pune" <certdrop.app@gmail.com>');
    expect(head).toContain('To: zoe@example.com');
    expect(head).toContain('Reply-To: organizer@example.com');
    expect(decodeHeader(/Subject: (.*(?:\r\n .*)*)/.exec(head!)![1]!)).toBe(message.subject);
    expect(head).toMatch(/Content-Type: multipart\/mixed; boundary="=_[0-9a-f]+"/);

    expect(mime).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(mime).toContain('Content-Type: text/html; charset=UTF-8');
    expect(mime).toContain(`filename*=UTF-8''Certificate%20-%20Zo%C3%AB.pdf`);
    expect(decodedParts(mime)).toEqual([message.text, message.html, '%PDF-1.7 test']);
  });

  it('skips the mixed wrapper without attachments', () => {
    const mime = buildMimeMessage({ ...message, attachments: undefined, replyTo: undefined }, 'a@gmail.com');
    expect(mime).toMatch(/^From:[^]*\r\nContent-Type: multipart\/alternative;/);
    expect(mime).not.toContain('multipart/mixed');
    expect(mime).not.toContain('Reply-To');
  });

  it('encodes a non-ASCII sender name and keeps injection out of it', () => {
    const mime = buildMimeMessage({ ...message, fromName: 'Clube Ciência"\r\nBcc: x@y.z' }, 'a@gmail.com');
    const from = /From: (.*(?:\r\n .*)*)/.exec(mime)![1]!;
    expect(decodeHeader(from)).toBe('Clube CiênciaBcc: x@y.z <a@gmail.com>');
    expect(mime).not.toMatch(/^Bcc:/m);
  });
});

describe('GmailEmailProvider', () => {
  afterEach(() => vi.unstubAllGlobals());

  const credentials = { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' };

  /** A fake Google: hands out numbered access tokens and answers sends with `sendStatus`. */
  function fakeGoogle(sendResponses: Array<{ status: number; body: unknown }> = []) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    let tokens = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit) => {
        calls.push({ url, init });
        if (url.includes('oauth2.googleapis.com/token')) {
          tokens++;
          return Promise.resolve(Response.json({ access_token: `access-${tokens}`, expires_in: 3599 }));
        }
        const next = sendResponses.shift() ?? { status: 200, body: { id: `msg-${calls.length}` } };
        return Promise.resolve(new Response(JSON.stringify(next.body), { status: next.status }));
      }),
    );
    return { calls, tokenCount: () => tokens };
  }

  it('sends the raw message with a cached access token', async () => {
    const google = fakeGoogle();
    const provider = new GmailEmailProvider(credentials, 'certdrop.app@gmail.com');

    const [a, b] = await Promise.all([provider.send(message), provider.send(message)]);
    expect(a.messageId).toMatch(/^msg-/);
    expect(b.messageId).toMatch(/^msg-/);
    expect(google.tokenCount()).toBe(1);

    const tokenBody = new URLSearchParams(google.calls[0]!.init.body as URLSearchParams);
    expect(tokenBody.get('grant_type')).toBe('refresh_token');
    expect(tokenBody.get('refresh_token')).toBe('refresh');

    const send = google.calls.find((c) => c.url.includes('/messages/send'))!;
    expect(send.url).toContain('uploadType=media');
    expect(send.init.headers).toMatchObject({
      Authorization: 'Bearer access-1',
      'Content-Type': 'message/rfc822',
    });
    expect(send.init.body).toContain('To: zoe@example.com');
  });

  it('refreshes the token once it expires', async () => {
    const google = fakeGoogle();
    let now = 0;
    const provider = new GmailEmailProvider(credentials, 'a@gmail.com', () => now);
    await provider.send(message);
    now = 3_600_000;
    await provider.send(message);
    expect(google.tokenCount()).toBe(2);
  });

  it('marks rate limits and server errors retryable, but not the daily cap', async () => {
    fakeGoogle([
      { status: 429, body: { error: { message: 'User-rate limit exceeded' } } },
      { status: 503, body: {} },
      { status: 403, body: { error: { errors: [{ reason: 'userRateLimitExceeded' }] } } },
      { status: 403, body: { error: { errors: [{ reason: 'dailyLimitExceeded' }] } } },
      { status: 400, body: { error: { message: 'Invalid To header' } } },
    ]);
    const provider = new GmailEmailProvider(credentials, 'a@gmail.com');
    const outcomes = [];
    for (let i = 0; i < 5; i++) {
      const err = await provider.send(message).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(EmailSendError);
      outcomes.push((err as EmailSendError).retryable);
    }
    expect(outcomes).toEqual([true, true, true, false, false]);
  });

  it('gets a new access token after a 401', async () => {
    const google = fakeGoogle([{ status: 401, body: {} }]);
    const provider = new GmailEmailProvider(credentials, 'a@gmail.com');
    await expect(provider.send(message)).rejects.toMatchObject({ retryable: true, status: 401 });
    await provider.send(message);
    expect(google.tokenCount()).toBe(2);
  });

  it('explains a revoked refresh token and does not retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{"error":"invalid_grant"}', { status: 400 }))),
    );
    const provider = new GmailEmailProvider(credentials, 'a@gmail.com');
    const err = (await provider.send(message).catch((e: unknown) => e)) as EmailSendError;
    expect(err.retryable).toBe(false);
    expect(err.message).toContain('gmail:token');
  });

  it('retries when Google cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
    );
    const provider = new GmailEmailProvider(credentials, 'a@gmail.com');
    await expect(provider.send(message)).rejects.toMatchObject({ retryable: true });
  });
});
