import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { contentDisposition } from '../lib/storage';
import {
  EmailSendError,
  sanitizeDisplayName,
  type EmailMessage,
  type EmailProvider,
  type SendResult,
} from './types';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
// The media-upload form of messages.send takes the raw MIME message and allows up to 35 MB,
// against roughly 5 MB for the JSON form. Docs: https://developers.google.com/gmail/api/reference/rest/v1/users.messages/send
const SEND_ENDPOINT = 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media';
const REQUEST_TIMEOUT_MS = 30_000;
/** Refresh the access token this long before Google says it expires. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

const TokenResponseSchema = z.object({ access_token: z.string(), expires_in: z.number() });
const SendResponseSchema = z.object({ id: z.string() });

export interface GmailCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/**
 * Sends through a Gmail account with the Gmail API over HTTPS. For deployments without a domain
 * to verify with Resend, and for hosts that block outbound SMTP (Render's free plan).
 *
 * Gmail has no idempotency key, so a send retried after a timeout can arrive twice. Gmail also
 * caps a personal account at about 500 recipients a day; past that, sends fail until the next day.
 */
export class GmailEmailProvider implements EmailProvider {
  private cachedToken: { value: string; expiresAt: number } | undefined;
  private refreshing: Promise<string> | undefined;

  constructor(
    private readonly credentials: GmailCredentials,
    private readonly fromAddress: string,
    private readonly now: () => number = Date.now,
  ) {}

  async send(message: EmailMessage): Promise<SendResult> {
    const accessToken = await this.accessToken();

    let res: Response;
    try {
      res = await fetch(SEND_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'message/rfc822' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: buildMimeMessage(message, this.fromAddress),
      });
    } catch (err) {
      throw new EmailSendError(`Gmail request failed: ${(err as Error).message}`, true);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // An access token revoked early: fetch a new one on the retry.
      if (res.status === 401) this.cachedToken = undefined;
      // 403 covers both short-term rate limits (worth retrying) and the daily cap (not).
      const retryable =
        res.status === 401 ||
        res.status === 429 ||
        res.status >= 500 ||
        (res.status === 403 && /rateLimitExceeded/i.test(detail));
      throw new EmailSendError(
        `Gmail responded ${res.status}: ${detail.slice(0, 300)}`,
        retryable,
        res.status,
      );
    }

    const body = SendResponseSchema.parse(await res.json());
    return { messageId: body.id };
  }

  /** A cached access token, refreshed shortly before it expires. Concurrent sends share one refresh. */
  private accessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > this.now()) {
      return Promise.resolve(this.cachedToken.value);
    }
    this.refreshing ??= this.refreshAccessToken()
      .then((token) => {
        this.cachedToken = token;
        return token.value;
      })
      .finally(() => {
        this.refreshing = undefined;
      });
    return this.refreshing;
  }

  private async refreshAccessToken(): Promise<{ value: string; expiresAt: number }> {
    let res: Response;
    try {
      res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: new URLSearchParams({
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret,
          refresh_token: this.credentials.refreshToken,
          grant_type: 'refresh_token',
        }),
      });
    } catch (err) {
      throw new EmailSendError(`Gmail token request failed: ${(err as Error).message}`, true);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      if (detail.includes('invalid_grant')) {
        throw new EmailSendError(
          'Gmail refused the refresh token (revoked, or expired because the OAuth app is in Testing). ' +
            'Create a new one with `pnpm --filter @certdrop/api gmail:token`.',
          false,
          res.status,
        );
      }
      throw new EmailSendError(
        `Gmail token request responded ${res.status}: ${detail.slice(0, 300)}`,
        res.status >= 500,
        res.status,
      );
    }

    const body = TokenResponseSchema.parse(await res.json());
    return {
      value: body.access_token,
      expiresAt: this.now() + body.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS,
    };
  }
}

/**
 * The RFC 5322 message: text and HTML alternatives, plus attachments when there are any. Every
 * body part is base64, so any UTF-8 content and line length is safe.
 */
export function buildMimeMessage(message: EmailMessage, fromAddress: string): string {
  const name = sanitizeDisplayName(message.fromName);
  // Plain names are quoted, since commas or dots would otherwise end the display name.
  const displayName = isPlainAscii(name) ? `"${name}"` : encodeHeader(name);
  const headers = [
    `From: ${displayName} <${headerSafe(fromAddress)}>`,
    `To: ${headerSafe(message.to)}`,
    ...(message.replyTo ? [`Reply-To: ${headerSafe(message.replyTo)}`] : []),
    `Subject: ${encodeHeader(message.subject)}`,
    'MIME-Version: 1.0',
  ];

  const alternative = multipart('alternative', [
    part(['Content-Type: text/plain; charset=UTF-8'], Buffer.from(message.text, 'utf8')),
    part(['Content-Type: text/html; charset=UTF-8'], Buffer.from(message.html, 'utf8')),
  ]);

  const body = message.attachments?.length
    ? multipart('mixed', [
        alternative,
        ...message.attachments.map((a) =>
          part(
            [
              `Content-Type: ${headerSafe(a.contentType)}`,
              `Content-Disposition: ${contentDisposition(a.filename)}`,
            ],
            a.content,
          ),
        ),
      ])
    : alternative;

  return `${headers.join('\r\n')}\r\n${body}`;
}

/** A MIME entity: its headers, a blank line, then the content. */
function multipart(subtype: 'alternative' | 'mixed', parts: string[]): string {
  const boundary = `=_${randomBytes(12).toString('hex')}`;
  return [
    `Content-Type: multipart/${subtype}; boundary="${boundary}"`,
    '',
    ...parts.map((p) => `--${boundary}\r\n${p}`),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

function part(headers: string[], content: Buffer): string {
  return [...headers, 'Content-Transfer-Encoding: base64', '', wrapBase64(content), ''].join('\r\n');
}

/** Base64 in lines of 76 characters, as MIME requires. */
function wrapBase64(content: Buffer): string {
  return (content.toString('base64').match(/.{1,76}/g) ?? []).join('\r\n');
}

/** Removes line breaks, so a value can never start a new header. */
const headerSafe = (value: string) => value.replace(/[\r\n]/g, '');

const isPlainAscii = (value: string) => /^[\x20-\x7e]*$/.test(value);

/**
 * Header text as-is when it's plain ASCII, otherwise as RFC 2047 encoded words. Each word holds
 * whole characters and stays under the 75-character limit.
 */
export function encodeHeader(value: string): string {
  const text = headerSafe(value);
  if (isPlainAscii(text)) return text;

  const words: string[] = [];
  let chunk = '';
  for (const char of text) {
    // 45 UTF-8 bytes encode to 60 base64 characters, plus 12 for the =?UTF-8?B?…?= wrapper.
    if (Buffer.byteLength(chunk + char, 'utf8') > 45) {
      words.push(chunk);
      chunk = '';
    }
    chunk += char;
  }
  words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ');
}
