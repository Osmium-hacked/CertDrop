export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailMessage {
  to: string;
  /** Display name for the From header; the address itself comes from EMAIL_FROM_ADDRESS. */
  fromName: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  attachments?: EmailAttachment[];
  /** Lets the provider drop duplicates when a job is retried after a timeout. */
  idempotencyKey?: string;
}

export interface SendResult {
  /** Provider's message ID, stored so delivery/bounce webhooks can be matched to a row. */
  messageId: string;
}

/**
 * Anything that can send an email. Add SES or SMTP by adding an implementation;
 * callers never import a specific provider.
 */
export interface EmailProvider {
  send(message: EmailMessage): Promise<SendResult>;
}

/** Thrown by providers. `retryable` tells the job queue whether trying again could help. */
export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'EmailSendError';
  }
}

/**
 * Builds `"Name" <address>`. Strips characters that could break out of the header (quotes,
 * angle brackets, CR/LF), since the name can contain organizer-supplied text.
 */
export function formatFrom(name: string, address: string): string {
  return `"${sanitizeDisplayName(name)}" <${address}>`;
}

export function sanitizeDisplayName(name: string): string {
  return (
    name
      .replace(/[\r\n"<>\\]/g, '')
      .trim()
      .slice(0, 100) || 'CertDrop'
  );
}
