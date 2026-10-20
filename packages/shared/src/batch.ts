import { z } from 'zod';
import { BATCH_MAX_ROWS } from './csv';
import { BATCH_STATUSES, CERTIFICATE_STATUSES, DELIVERY_STATUSES } from './enums';
import { LayoutSchema } from './layout';

/** Placeholders the organizer can use in the email subject and message. */
export const EMAIL_PLACEHOLDERS = ['{name}', '{event}', '{issuer}'] as const;

export const DEFAULT_EMAIL_SUBJECT = 'Your certificate for {event}';
export const DEFAULT_EMAIL_MESSAGE =
  'Hi {name},\n\nThank you for taking part in {event}. Your certificate is attached, and anyone can confirm it is genuine using the verification link below.\n\nBest wishes,\n{issuer}';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Details shown on the certificate email and the public verification page. */
export const EventDetailsSchema = z.object({
  eventName: z.string().trim().min(1, 'Enter the event name').max(120, 'Keep it under 120 characters'),
  issuerName: z
    .string()
    .trim()
    .min(1, 'Enter who is issuing the certificates')
    .max(100, 'Keep it under 100 characters'),
  issueDate: z
    .string()
    .regex(ISO_DATE, 'Pick a date')
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Pick a valid date'),
  emailSubject: z.string().trim().min(1, 'Enter a subject').max(150, 'Keep it under 150 characters'),
  emailMessage: z.string().trim().min(1, 'Enter a message').max(2000, 'Keep it under 2,000 characters'),
});
export type EventDetails = z.infer<typeof EventDetailsSchema>;

export interface PlaceholderValues {
  name: string;
  event: string;
  issuer: string;
}

/** Fills {name}, {event} and {issuer}. Unknown braces are left as typed. */
export function fillPlaceholders(template: string, values: PlaceholderValues): string {
  return template.replace(/\{(name|event|issuer)\}/g, (_, key: keyof PlaceholderValues) => values[key]);
}

/** One recipient as sent to POST /batches. The API re-validates every row with validateRows. */
export const RecipientSchema = z.object({
  name: z.string().max(500),
  email: z.string().max(500),
});

export const BatchCreateSchema = z.object({
  templateId: z.string().min(1).max(64),
  layout: LayoutSchema,
  event: EventDetailsSchema,
  recipients: z
    .array(RecipientSchema)
    .min(1, 'Add at least one participant')
    .max(BATCH_MAX_ROWS, `A batch can have up to ${BATCH_MAX_ROWS} participants`),
});
export type BatchCreate = z.infer<typeof BatchCreateSchema>;

export const BatchCountsSchema = z.object({
  total: z.number().int(),
  queued: z.number().int(),
  generated: z.number().int(),
  sent: z.number().int(),
  failed: z.number().int(),
});
export type BatchCounts = z.infer<typeof BatchCountsSchema>;

export const BatchSummarySchema = z.object({
  id: z.string(),
  status: z.enum(BATCH_STATUSES),
  eventName: z.string(),
  issuerName: z.string(),
  createdAt: z.string(),
  /** Set once the retention cleanup removed the PDFs; verification still works after that. */
  filesDeletedAt: z.string().nullable(),
  counts: BatchCountsSchema,
});
export type BatchSummary = z.infer<typeof BatchSummarySchema>;
export const BatchResponseSchema = z.object({ batch: BatchSummarySchema });

export const CertificateRowSchema = z.object({
  id: z.string(),
  rowIndex: z.number().int(),
  recipientName: z.string(),
  recipientEmail: z.string(),
  status: z.enum(CERTIFICATE_STATUSES),
  error: z.string().nullable(),
  sentAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  /** From the email provider's webhooks, when configured. */
  deliveryStatus: z.enum(DELIVERY_STATUSES).nullable(),
});
export type CertificateRow = z.infer<typeof CertificateRowSchema>;

export const CERTIFICATE_PAGE_MAX = 200;
export const CertificatePageSchema = z.object({
  items: z.array(CertificateRowSchema),
  /** Pass as ?cursor= to get the next page; null on the last page. */
  nextCursor: z.number().int().nullable(),
});
export type CertificatePage = z.infer<typeof CertificatePageSchema>;

export const CertificateListQuerySchema = z.object({
  status: z.enum(CERTIFICATE_STATUSES).optional(),
  cursor: z.coerce.number().int().min(-1).optional(),
  limit: z.coerce.number().int().min(1).max(CERTIFICATE_PAGE_MAX).default(100),
});
