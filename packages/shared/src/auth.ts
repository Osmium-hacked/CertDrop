import { z } from 'zod';

/** OTP policy, shared so the UI can show accurate countdowns and limits. */
export const OTP_POLICY = {
  length: 6,
  ttlSeconds: 10 * 60,
  resendCooldownSeconds: 60,
  maxAttempts: 5,
  maxPerEmailPerHour: 5,
} as const;

/** Trimmed and lowercased before validation, so "Ana@Example.com " and "ana@example.com" match. */
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .pipe(z.email('Enter a valid email address'));

export const OtpRequestBodySchema = z.object({
  email: EmailSchema,
  /** Cloudflare Turnstile token, required whenever the server has Turnstile configured. */
  captchaToken: z.string().max(2048).optional(),
});
export type OtpRequestBody = z.infer<typeof OtpRequestBodySchema>;

export const OtpRequestResponseSchema = z.object({
  expiresInSeconds: z.number().int(),
  resendInSeconds: z.number().int(),
});
export type OtpRequestResponse = z.infer<typeof OtpRequestResponseSchema>;

export const OtpVerifyBodySchema = z.object({
  email: EmailSchema,
  code: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${OTP_POLICY.length}}$`), `Enter the ${OTP_POLICY.length}-digit code`),
});
export type OtpVerifyBody = z.infer<typeof OtpVerifyBodySchema>;

export const OrganizerSchema = z.object({
  id: z.string(),
  email: z.email(),
});
export type Organizer = z.infer<typeof OrganizerSchema>;

/** GET /auth/me: `organizer` is null when there is no valid session (not an error). */
export const SessionResponseSchema = z.object({
  organizer: OrganizerSchema.nullable(),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
