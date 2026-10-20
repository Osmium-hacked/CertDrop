import { z } from 'zod';
import { EmailSendError, formatFrom, type EmailMessage, type EmailProvider, type SendResult } from './types';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 15_000;

const ResendSuccessSchema = z.object({ id: z.string() });

/**
 * Resend over its REST API with plain fetch: one endpoint doesn't justify an SDK dependency, and
 * it keeps error handling explicit. Docs: https://resend.com/docs/api-reference/emails/send-email
 */
export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fromAddress: string,
  ) {}

  async send(message: EmailMessage): Promise<SendResult> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (message.idempotencyKey) headers['Idempotency-Key'] = message.idempotencyKey;

    let res: Response;
    try {
      res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          from: formatFrom(message.fromName, this.fromAddress),
          to: [message.to],
          reply_to: message.replyTo,
          subject: message.subject,
          text: message.text,
          html: message.html,
          attachments: message.attachments?.map((a) => ({
            filename: a.filename,
            content: a.content.toString('base64'),
            content_type: a.contentType,
          })),
        }),
      });
    } catch (err) {
      // Network failure or timeout: the email may or may not have been accepted. Retrying is safe
      // because of the idempotency key.
      throw new EmailSendError(`Resend request failed: ${(err as Error).message}`, true);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // 429 (rate limited) and 5xx are transient; other 4xx mean the request itself is wrong.
      const retryable = res.status === 429 || res.status >= 500;
      throw new EmailSendError(
        `Resend responded ${res.status}: ${detail.slice(0, 300)}`,
        retryable,
        res.status,
      );
    }

    const body = ResendSuccessSchema.parse(await res.json());
    return { messageId: body.id };
  }
}
