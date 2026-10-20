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
