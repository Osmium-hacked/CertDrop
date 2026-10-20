import { z } from 'zod';

/**
 * Public certificate IDs look like "CD-7kQm2xPd9T". The alphabet drops look-alike characters
 * (0/O, 1/l/I) so IDs survive being read aloud or typed from a printout. 55 symbols × 10
 * positions ≈ 2.5 × 10¹⁷ combinations (~58 bits): far too many to guess or enumerate, which is
 * what keeps the public verify page from leaking who got certificates.
 */
export const CERT_ID_PREFIX = 'CD-';
export const CERT_ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
export const CERT_ID_LENGTH = 10;

export const CERT_ID_PATTERN = new RegExp(`^${CERT_ID_PREFIX}[${CERT_ID_ALPHABET}]{${CERT_ID_LENGTH}}$`);
export const CertIdSchema = z.string().regex(CERT_ID_PATTERN, 'Not a valid certificate ID');

export function verifyUrl(publicAppUrl: string, certId: string): string {
  return `${publicAppUrl.replace(/\/+$/, '')}/verify/${certId}`;
}

/** GET /verify/:certId. Unknown or never-issued IDs are a 404, not a status. */
export const VerifyResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('valid'),
    certificate: z.object({
      id: z.string(),
      recipientName: z.string(),
      eventName: z.string(),
      issuerName: z.string(),
      /** YYYY-MM-DD, the date the organizer chose. */
      issueDate: z.string(),
    }),
  }),
  z.object({
    // A revoked certificate confirms it existed but no longer vouches for anyone, so the
    // recipient's name is not shown.
    status: z.literal('revoked'),
    certificate: z.object({
      id: z.string(),
      eventName: z.string(),
      issuerName: z.string(),
      revokedAt: z.string(),
    }),
  }),
]);
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;
