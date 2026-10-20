import { describe, expect, it } from 'vitest';
import { EmailSchema, OtpVerifyBodySchema } from './auth';

describe('EmailSchema', () => {
  it('normalizes case and whitespace', () => {
    expect(EmailSchema.parse('  Ana.Silva@Example.COM ')).toBe('ana.silva@example.com');
  });

  it.each(['', 'not-an-email', 'a@', '@b.com', 'a b@c.com'])('rejects %j', (value) => {
    expect(EmailSchema.safeParse(value).success).toBe(false);
  });
});

describe('OtpVerifyBodySchema', () => {
  it('accepts a 6-digit code', () => {
    expect(OtpVerifyBodySchema.parse({ email: 'a@b.co', code: ' 012345 ' }).code).toBe('012345');
  });

  it.each(['12345', '1234567', '12a456', ''])('rejects code %j', (code) => {
    expect(OtpVerifyBodySchema.safeParse({ email: 'a@b.co', code }).success).toBe(false);
  });
});
