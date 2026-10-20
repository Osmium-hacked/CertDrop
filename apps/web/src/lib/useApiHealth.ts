import { HealthResponseSchema } from '@certdrop/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/**
 * The API's health, shared by the footer status and the wake-up notice. Checks every 30 seconds,
 * or every 5 while the API is unreachable, so the page notices quickly when a sleeping server is
 * back up.
 */
export function useApiHealth() {
  return useQuery({
    queryKey: ['health'],
    // 503 still carries a body that says which dependency is down.
    queryFn: ({ signal }) => api('/health', HealthResponseSchema, { signal, acceptStatus: [503] }),
    refetchInterval: (query) => (query.state.status === 'error' ? 5_000 : 30_000),
    retry: false,
  });
}
