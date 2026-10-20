import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { formatFrom, type EmailMessage, type EmailProvider, type SendResult } from './types';

/**
 * Development/test provider: writes each email to disk instead of sending it.
 *   <dir>/<timestamp>-<id>/message.json   headers, text and metadata
 *   <dir>/<timestamp>-<id>/message.html   open in a browser to preview
 *   <dir>/<timestamp>-<id>/<attachment>   e.g. the certificate PDF
 * File names never include the recipient address.
 */
export class FileEmailProvider implements EmailProvider {
  constructor(
    private readonly dir: string,
    private readonly fromAddress: string,
  ) {}

  async send(message: EmailMessage): Promise<SendResult> {
    const messageId = `file-${randomUUID()}`;
    const folder = path.join(this.dir, `${Date.now()}-${messageId}`);
    await mkdir(folder, { recursive: true });

    const attachments = message.attachments ?? [];
    await Promise.all(
      attachments.map((a) => writeFile(path.join(folder, path.basename(a.filename)), a.content)),
    );
    await writeFile(path.join(folder, 'message.html'), message.html);
    await writeFile(
      path.join(folder, 'message.json'),
      JSON.stringify(
        {
          messageId,
          from: formatFrom(message.fromName, this.fromAddress),
          to: message.to,
          replyTo: message.replyTo,
          subject: message.subject,
          text: message.text,
          attachments: attachments.map((a) => ({
            filename: a.filename,
            contentType: a.contentType,
            bytes: a.content.length,
          })),
          idempotencyKey: message.idempotencyKey,
          writtenAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    return { messageId };
  }
}
