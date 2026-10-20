import { z } from 'zod';

/** Every non-2xx JSON response from the API has this shape. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    /** Field-level validation issues, keyed by dotted path. */
    fields: z.record(z.string(), z.array(z.string())).optional(),
    /** For throttled requests: how long until trying again can succeed. */
    retryAfterSeconds: z.number().int().optional(),
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
