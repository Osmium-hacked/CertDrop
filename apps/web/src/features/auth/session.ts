import {
  OtpRequestResponseSchema,
  SessionResponseSchema,
  type OtpRequestBody,
  type OtpVerifyBody,
  type SessionResponse,
} from '@certdrop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../../lib/api';

const SESSION_KEY = ['session'] as const;

/** The signed-in organizer, or null. Checked once on load; mutations below keep it current. */
export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: ({ signal }) => api('/auth/me', SessionResponseSchema, { signal }),
    staleTime: Infinity,
  });
}

export function useRequestCode() {
  return useMutation({
    mutationFn: (body: OtpRequestBody) =>
      api('/auth/otp/request', OtpRequestResponseSchema, { method: 'POST', body }),
  });
}

export function useVerifyCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OtpVerifyBody) =>
      api('/auth/otp/verify', SessionResponseSchema, { method: 'POST', body }),
    onSuccess: (data) => queryClient.setQueryData<SessionResponse>(SESSION_KEY, data),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api('/auth/logout', z.unknown(), { method: 'POST' }),
    onSuccess: () => queryClient.setQueryData<SessionResponse>(SESSION_KEY, { organizer: null }),
  });
}
