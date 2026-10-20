import { CERT_ID_ALPHABET, CERT_ID_LENGTH, CERT_ID_PREFIX } from '@certdrop/shared';
import { customAlphabet } from 'nanoid';

// nanoid draws from the OS CSPRNG with uniform distribution over the alphabet (no modulo bias).
const randomPart = customAlphabet(CERT_ID_ALPHABET, CERT_ID_LENGTH);

/** A new public certificate ID, e.g. "CD-7kQm2xPd9T". See CERT_ID_ALPHABET for the reasoning. */
export function generateCertId(): string {
  return `${CERT_ID_PREFIX}${randomPart()}`;
}
