import {
  BatchResponseSchema,
  CertificatePageSchema,
  type BatchCreate,
  type CertificateStatus,
} from '@certdrop/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { z } from 'zod';
import { api } from '../../lib/api';

/** Progress refreshes every 2s while the worker is busy; SSE would need worker→API fan-out for little gain. */
const POLL_MS = 2000;

export function useCreateBatch() {
  return useMutation({
    mutationFn: (body: BatchCreate) => api('/batches', BatchResponseSchema, { method: 'POST', body }),
  });
}

export function useBatch(batchId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['batch', batchId],
    queryFn: ({ signal }) => api(`/batches/${batchId}`, BatchResponseSchema, { signal }),
    refetchInterval: (q) => (q.state.data?.batch.status === 'PROCESSING' ? POLL_MS : false),
  });

  // When the batch finishes, fetch the rows once more so the table shows the final state.
  const status = query.data?.batch.status;
  useEffect(() => {
    if (status && status !== 'PROCESSING')
      void queryClient.invalidateQueries({ queryKey: ['certificates', batchId] });
  }, [status, batchId, queryClient]);

  return query;
}

export function useCertificates(batchId: string, status: CertificateStatus | undefined, polling: boolean) {
  return useInfiniteQuery({
    queryKey: ['certificates', batchId, status ?? 'all'],
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: '100' });
      if (status) params.set('status', status);
      if (pageParam !== undefined) params.set('cursor', String(pageParam));
      return api(`/batches/${batchId}/certificates?${params}`, CertificatePageSchema, { signal });
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: polling ? POLL_MS : false,
  });
}

export function useRetryFailed(batchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api(`/batches/${batchId}/retry-failed`, z.object({ retried: z.number() }), { method: 'POST' }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['batch', batchId] }),
        queryClient.invalidateQueries({ queryKey: ['certificates', batchId] }),
      ]),
  });
}
