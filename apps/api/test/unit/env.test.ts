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

  it('requires all three Gmail credentials when sending through Gmail', () => {
    const gmail = {
      ...BASE_TEST_ENV,
      EMAIL_PROVIDER: 'gmail',
      GMAIL_CLIENT_ID: 'id.apps.googleusercontent.com',
      GMAIL_CLIENT_SECRET: 'secret',
      GMAIL_REFRESH_TOKEN: '1//token',
    };
    expect(loadEnv(gmail).EMAIL_PROVIDER).toBe('gmail');
    expect(() => loadEnv({ ...gmail, GMAIL_REFRESH_TOKEN: undefined })).toThrow(/GMAIL_REFRESH_TOKEN/);
    expect(() => loadEnv({ ...gmail, GMAIL_CLIENT_ID: undefined, GMAIL_CLIENT_SECRET: undefined })).toThrow(
      /GMAIL_CLIENT_ID[\s\S]*GMAIL_CLIENT_SECRET/,
    );
  });

  it('runs the worker in the API only when asked', () => {
    expect(loadEnv(BASE_TEST_ENV).RUN_WORKER_IN_API).toBe(false);
    expect(loadEnv({ ...BASE_TEST_ENV, RUN_WORKER_IN_API: 'true' }).RUN_WORKER_IN_API).toBe(true);
  });

  it('refuses unsafe settings in production', () => {
    const production = {
      ...BASE_TEST_ENV,
      NODE_ENV: 'production',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_x',
      TURNSTILE_SECRET_KEY: '0x4AAAA-secret',
    };
    expect(() => loadEnv(production)).not.toThrow();
    expect(() => loadEnv({ ...production, EMAIL_PROVIDER: 'file' })).toThrow(/EMAIL_PROVIDER/);
    expect(() => loadEnv({ ...production, TURNSTILE_SECRET_KEY: undefined })).toThrow(/TURNSTILE_SECRET_KEY/);
  });

  it('only accepts Svix-style webhook secrets', () => {
    expect(() => loadEnv({ ...BASE_TEST_ENV, RESEND_WEBHOOK_SECRET: 'plain-secret' })).toThrow(
      /RESEND_WEBHOOK_SECRET/,
    );
    expect(loadEnv({ ...BASE_TEST_ENV, RESEND_WEBHOOK_SECRET: 'whsec_abc' }).RESEND_WEBHOOK_SECRET).toBe(
      'whsec_abc',
    );
  });
});
