import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env';
import { BASE_TEST_ENV } from '../helpers/env';

describe('loadEnv', () => {
  it('applies defaults and parses typed values', () => {
    const env = loadEnv({
      ...BASE_TEST_ENV,
      NODE_ENV: 'development',
      PORT: '4000',
      S3_FORCE_PATH_STYLE: 'true',
      CORS_ORIGINS: ' https://a.dev , https://b.dev ',
    });
    expect(env.PORT).toBe(4000);
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.CORS_ORIGINS).toEqual(['https://a.dev', 'https://b.dev']);
    expect(env.EMAIL_PROVIDER).toBe('file');
    expect(env.TRUST_PROXY_HOPS).toBe(0);
  });

  it('names missing variables', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('never echoes secret values in the error', () => {
    try {
      loadEnv({
        ...BASE_TEST_ENV,
        DATABASE_URL: 'mysql://root:hunter2@db/x',
        SESSION_SECRET: 'short-s3cret',
      });
      expect.unreachable();
    } catch (err) {
      expect(String(err)).toContain('DATABASE_URL');
      expect(String(err)).toContain('SESSION_SECRET');
      expect(String(err)).not.toContain('hunter2');
      expect(String(err)).not.toContain('short-s3cret');
    }
  });

  it('requires an API key when sending through Resend', () => {
    expect(() => loadEnv({ ...BASE_TEST_ENV, EMAIL_PROVIDER: 'resend' })).toThrow(/RESEND_API_KEY/);
  });

  it('refuses the file email provider in production', () => {
    expect(() => loadEnv({ ...BASE_TEST_ENV, NODE_ENV: 'production' })).toThrow(/EMAIL_PROVIDER/);
    expect(() =>
      loadEnv({ ...BASE_TEST_ENV, NODE_ENV: 'production', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_x' }),
    ).not.toThrow();
  });
});
