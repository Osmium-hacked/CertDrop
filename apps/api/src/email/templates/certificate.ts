import { fillPlaceholders } from '@certdrop/shared';
import type { EmailMessage } from '../types';
import { emailLayout, escapeHtml } from './layout';

export interface CertificateEmailInput {
  to: string;
  recipientName: string;
  eventName: string;
  issuerName: string;
  organizerEmail: string;
  subjectTemplate: string;
  messageTemplate: string;
  verifyUrl: string;
  certId: string;
  pdf: Uint8Array;
}

/** Characters that break file names on some systems, plus control characters. */
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const unsafeFileChars = /[\\/:*?"<>|\u0000-\u001f]/g;
const fileSafe = (value: string) =>
  value.replace(unsafeFileChars, '').replace(/\s+/g, ' ').trim().slice(0, 60);

export function certificateFileName(eventName: string, recipientName: string): string {
  return `Certificate - ${fileSafe(eventName) || 'Event'} - ${fileSafe(recipientName) || 'Recipient'}.pdf`;
}

/** Plain text → HTML paragraphs: blank lines split paragraphs, single newlines become <br>. */
function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:23px;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`,
    )
    .join('');
}

/**
 * The email each participant receives. It names the issuer and the event up front (From name,
 * subject, footer) so recipients know who sent it, and replies go to the organizer, not to us.
 */
export function certificateEmail(input: CertificateEmailInput): EmailMessage {
  const values = { name: input.recipientName, event: input.eventName, issuer: input.issuerName };
  const subject = fillPlaceholders(input.subjectTemplate, values).replace(/[\r\n]+/g, ' ');
  const message = fillPlaceholders(input.messageTemplate, values);
  const footer = `You’re receiving this because ${input.issuerName} issued you a certificate for ${input.eventName} using CertDrop. Reply to this email to contact ${input.issuerName}.`;

  return {
    to: input.to,
    fromName: input.issuerName,
    replyTo: input.organizerEmail,
    subject,
    text: [
      message,
      '',
      `Verify this certificate: ${input.verifyUrl}`,
      `Certificate ID: ${input.certId}`,
      '',
      '—',
      footer,
    ].join('\n'),
    html: emailLayout(
      `${paragraphs(message)}
      <p style="margin:22px 0 8px;">
        <a href="${escapeHtml(input.verifyUrl)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">Verify this certificate</a>
      </p>
      <p style="margin:0;font-size:12px;line-height:18px;color:#71717a;">Certificate ID <span style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;">${escapeHtml(input.certId)}</span></p>`,
      footer,
    ),
    attachments: [
      {
        filename: certificateFileName(input.eventName, input.recipientName),
        content: Buffer.from(input.pdf),
        contentType: 'application/pdf',
      },
    ],
    // Same key on every retry, so the provider drops duplicates if a timeout hid a success.
    idempotencyKey: `certificate-${input.certId}`,
  };
}
