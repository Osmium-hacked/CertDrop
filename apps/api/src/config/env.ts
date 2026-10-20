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

  /** Leave S3_ENDPOINT unset for AWS; set it for Cloudflare R2 or MinIO. */
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  /** MinIO needs path-style URLs (http://host/bucket/key); R2 and AWS work with virtual-hosted style. */
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parses and validates configuration once at startup. Fails fast with a list of the offending
 * variable names, but never echoes their values, which may be secrets.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  }
  return result.data;
}
