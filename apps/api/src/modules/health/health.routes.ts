import type { HealthResponse } from '@certdrop/shared';
import type { FastifyPluginAsync } from 'fastify';
import { withTimeout } from '../../lib/async';
import type { AppDeps } from '../../app';

const CHECK_TIMEOUT_MS = 2_000;

export const healthRoutes =
  (deps: AppDeps): FastifyPluginAsync =>
  // eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugins are async by contract
  async (app) => {
    app.get('/health', async (request, reply) => {
      const check = async (name: string, fn: () => Promise<unknown>) => {
        try {
          await withTimeout(fn(), CHECK_TIMEOUT_MS, name);
          return 'ok' as const;
        } catch (err) {
          request.log.warn({ err, dependency: name }, 'health check failed');
          return 'down' as const;
        }
      };

      const [database, storage] = await Promise.all([
        check('database', () => deps.prisma.$queryRaw`SELECT 1`),
        check('storage', () => deps.storage.ping()),
      ]);

      const healthy = database === 'ok' && storage === 'ok';
      const response: HealthResponse = {
        status: healthy ? 'ok' : 'degraded',
        version: deps.env.APP_VERSION,
        uptimeSeconds: Math.round(process.uptime()),
        checks: { database, storage },
      };
      // 503 lets load balancers and Render's health check take a broken instance out of rotation.
      return reply.status(healthy ? 200 : 503).send(response);
    });
  };
