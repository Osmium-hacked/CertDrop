import { z } from 'zod';

export const DependencyStatusSchema = z.enum(['ok', 'down']);

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptimeSeconds: z.number(),
  checks: z.object({
    database: DependencyStatusSchema,
    storage: DependencyStatusSchema,
  }),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
