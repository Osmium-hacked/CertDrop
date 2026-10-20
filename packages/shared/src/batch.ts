import { z } from 'zod';

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
