import { loadEnv, type Env } from '../../src/config/env';

/** Minimal valid configuration for tests; override individual variables per test. */
export const BASE_TEST_ENV = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  PUBLIC_APP_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  S3_BUCKET: 'certdrop',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'super-secret-value',
  SESSION_SECRET: 'test-session-secret-0123456789abcdef',
  OTP_SECRET: 'test-otp-secret-0123456789abcdefghij',
} satisfies NodeJS.ProcessEnv;

export function testEnv(overrides: NodeJS.ProcessEnv = {}): Env {
  return loadEnv({ ...BASE_TEST_ENV, ...overrides });
}
