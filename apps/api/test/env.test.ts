import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';

const base = {
  PUBLIC_APP_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  S3_BUCKET: 'certdrop',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'super-secret-value',
};

describe('loadEnv', () => {
  it('applies defaults and parses typed values', () => {
    const env = loadEnv({
      ...base,
      PORT: '4000',
      S3_FORCE_PATH_STYLE: 'true',
      CORS_ORIGINS: ' https://a.dev , https://b.dev ',
    });
    expect(env.PORT).toBe(4000);
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.CORS_ORIGINS).toEqual(['https://a.dev', 'https://b.dev']);
    expect(env.NODE_ENV).toBe('development');
  });

  it('names missing variables', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('never echoes secret values in the error', () => {
    try {
      loadEnv({ ...base, DATABASE_URL: 'mysql://root:hunter2@db/x' });
      expect.unreachable();
    } catch (err) {
      expect(String(err)).toContain('DATABASE_URL');
      expect(String(err)).not.toContain('hunter2');
    }
  });
});
