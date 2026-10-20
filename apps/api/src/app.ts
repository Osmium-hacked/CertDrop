import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import type { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Env } from './config/env';
import { registerErrorHandlers } from './lib/errors';
import type { Logger } from './lib/logger';
import type { Storage } from './lib/storage';
import { healthRoutes } from './modules/health/health.routes';

/**
 * Everything the HTTP layer needs, passed in rather than imported, so tests can build the app
 * with fakes and the server/worker entry points own the real connections.
 */
export interface AppDeps {
  env: Env;
  logger: Logger;
  prisma: PrismaClient;
  storage: Storage;
}

/** JSON bodies are small (a 1,000-row batch is ~150 KB); files go straight to object storage. */
const BODY_LIMIT_BYTES = 1024 * 1024;

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  // Widening pino's Logger to FastifyBaseLogger keeps the app typed as a plain FastifyInstance,
  // instead of threading a logger generic through every plugin and route.
  const loggerInstance: FastifyBaseLogger = deps.logger;
  const app = Fastify({ loggerInstance, bodyLimit: BODY_LIMIT_BYTES });

  await app.register(helmet);

  // Production serves /api from the web app's own origin (a Vercel rewrite), so CORS only matters
  // for origins listed explicitly. Requests without an Origin header (curl, health checks) pass.
  const allowedOrigins = new Set([deps.env.PUBLIC_APP_URL, ...deps.env.CORS_ORIGINS]);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.has(origin)),
    credentials: true,
  });

  registerErrorHandlers(app);

  await app.register(
    async (api) => {
      await api.register(healthRoutes(deps));
    },
    { prefix: '/api' },
  );

  return app;
}
