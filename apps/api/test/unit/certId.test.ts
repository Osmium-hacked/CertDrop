import { CERT_ID_PATTERN, CertIdSchema, verifyUrl } from '@certdrop/shared';
import { describe, expect, it } from 'vitest';
import { generateCertId } from '../../src/lib/certId';

describe('generateCertId', () => {
  it('produces CD- plus 10 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 1000; i++) {
      const id = generateCertId();
      expect(id).toMatch(CERT_ID_PATTERN);
      expect(id.slice(3)).not.toMatch(/[01OIlo]/);
    }
  });

  it('does not repeat across many IDs', () => {
    const ids = new Set(Array.from({ length: 10_000 }, generateCertId));
    expect(ids.size).toBe(10_000);
  });
});

describe('CertIdSchema', () => {
  it.each(['CD-7kQm2xPd9T', 'CD-2222222222'])('accepts %s', (id) => {
    expect(CertIdSchema.safeParse(id).success).toBe(true);
  });

  it.each(['CD-7kQm2xPd9', 'cd-7kQm2xPd9T', 'CD-7kQm2xPd9O', 'CD-../../etc', "CD-1' OR 1=1"])(
    'rejects %s',
    (id) => {
      expect(CertIdSchema.safeParse(id).success).toBe(false);
    },
  );
});

describe('verifyUrl', () => {
  it('builds the public verification link without doubled slashes', () => {
    expect(verifyUrl('https://certdrop.app/', 'CD-7kQm2xPd9T')).toBe(
      'https://certdrop.app/verify/CD-7kQm2xPd9T',
    );
  });
});
