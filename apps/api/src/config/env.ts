import { z } from 'zod';

/** Comma-separated list in an env var → array of trimmed, non-empty strings. */
const csv = z
  .string()
  .default('')
  .transform((s) =>
    s
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_VERSION: z.string().default('dev'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Public origin of the web app; used for verify links and QR codes. */
  PUBLIC_APP_URL: z.url(),
  /** Extra browser origins allowed by CORS. In production the web app proxies /api, so this is usually empty. */
  CORS_ORIGINS: csv.pipe(z.array(z.url())),

  DATABASE_URL: z.url().startsWith('postgres', 'DATABASE_URL must be a postgres:// URL'),

  /** Number of reverse proxies in front of the API (Vercel + Render = 2), so req.ip is the client's. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

  /** Leave S3_ENDPOINT unset for AWS; set it for Cloudflare R2 or the local RustFS container. */
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  /** RustFS/MinIO need path-style URLs (http://host/bucket/key); R2 and AWS work with virtual-hosted style. */
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),

  /** Signs session JWTs. Generate with: node -e "console.log(crypto.randomBytes(32).toString('base64url'))" */
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  /** HMAC key for stored OTP hashes. Separate from SESSION_SECRET so rotating one doesn't affect the other. */
  OTP_SECRET: z.string().min(32, 'OTP_SECRET must be at least 32 characters'),

  /** "file" writes emails to MAIL_OUTBOX_DIR instead of sending them (development and tests only). */
  EMAIL_PROVIDER: z.enum(['file', 'resend']).default('file'),
  /** Sender address on a domain verified with the provider. The display name is set per email. */
  EMAIL_FROM_ADDRESS: z.email().default('certificates@certdrop.local'),
  RESEND_API_KEY: z.string().min(1).optional(),
  MAIL_OUTBOX_DIR: z.string().default('.mail-outbox'),
});

/** Rules that span several variables. */
const RefinedEnvSchema = EnvSchema.superRefine((env, ctx) => {
  if (env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['RESEND_API_KEY'],
      message: 'Required when EMAIL_PROVIDER=resend',
    });
  }
  if (env.NODE_ENV === 'production' && env.EMAIL_PROVIDER === 'file') {
    ctx.addIssue({
      code: 'custom',
      path: ['EMAIL_PROVIDER'],
      message: 'The file provider never delivers mail; use resend in production',
    });
  }
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parses and validates configuration once at startup. Fails fast with a list of the offending
 * variable names, but never echoes their values, which may be secrets.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = RefinedEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  }
  return result.data;
}
