import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Env } from './config/env';
import type { EmailProvider } from './email';
import { HttpError, registerErrorHandlers } from './lib/errors';
import type { Logger } from './lib/logger';
import type { Storage } from './lib/storage';
import { authRoutes } from './modules/auth/auth.routes';
import { OtpService } from './modules/auth/otp.service';
import { SessionManager } from './modules/auth/session';
import { healthRoutes } from './modules/health/health.routes';
import { templateRoutes } from './modules/templates/templates.routes';

/**
 * Everything the HTTP layer needs, passed in rather than imported, so tests can build the app
 * with fakes and the server/worker entry points own the real connections.
 */
export interface AppDeps {
  env: Env;
  logger: Logger;
  prisma: PrismaClient;
  storage: Storage;
  email: EmailProvider;
  /** Defaults to the system clock; tests pass a controllable one. */
  now?: () => Date;
}

/** JSON bodies are small (a 1,000-row batch is ~150 KB); files go straight to object storage. */
const BODY_LIMIT_BYTES = 1024 * 1024;

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { env } = deps;
  const now = deps.now ?? (() => new Date());

  // Widening pino's Logger to FastifyBaseLogger keeps the app typed as a plain FastifyInstance,
  // instead of threading a logger generic through every plugin and route.
  const loggerInstance: FastifyBaseLogger = deps.logger;
  const app = Fastify({
    loggerInstance,
    bodyLimit: BODY_LIMIT_BYTES,
    // Behind Vercel and Render, the client IP is in X-Forwarded-For. Trusting exactly the known
    // number of hops stops clients from spoofing their IP to dodge rate limits. 0 trusts none.
    trustProxy: (_address, hop) => hop < env.TRUST_PROXY_HOPS,
  });

  // JSON only. Fastify also parses text/plain by default, which is a "simple" CORS content type
  // that cross-site forms can send; there is no reason to accept it.
  app.removeContentTypeParser('text/plain');

  await app.register(helmet);

  // Production serves /api from the web app's own origin (a Vercel rewrite), so CORS only matters
  // for origins listed explicitly. Requests without an Origin header (curl, health checks) pass.
  const allowedOrigins = new Set([env.PUBLIC_APP_URL, ...env.CORS_ORIGINS]);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.has(origin)),
    credentials: true,
  });

  await app.register(cookie);

  // Opt-in per route via `config.rateLimit`. In-memory store: correct for a single API instance;
  // switch to the Redis store (or a Postgres-backed one) before running several instances.
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) =>
      new HttpError(429, 'RATE_LIMITED', `Too many requests. Try again in ${context.after}.`),
  });

  registerErrorHandlers(app);

  const otp = new OtpService({
    prisma: deps.prisma,
    email: deps.email,
    otpSecret: env.OTP_SECRET,
    logger: deps.logger,
    now,
  });
  const session = new SessionManager(env.SESSION_SECRET, env.NODE_ENV === 'production');
  app.decorateRequest('organizer', null);

  await app.register(
    async (api) => {
      await api.register(healthRoutes(deps));
      await api.register(authRoutes({ otp, session }));
      await api.register(templateRoutes({ prisma: deps.prisma, storage: deps.storage, session }));
    },
    { prefix: '/api' },
  );

  return app;
}
