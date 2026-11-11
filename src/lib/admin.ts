/** 管理員 App 內審核（只有 app_admins 名單裡的帳號看得到） */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { unwrap } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

export type QueueRow = {
  bookstore_id: string;
  store_name: string;
  slug: string;
  status: 'active' | 'paused' | 'deleted';
  report_count: number;
  reporter_count: number;
  reasons: string[];
  last_reported_at: string;
  details: string[];
};

export function useIsAdmin() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['is-admin', session?.user.id],
    enabled: !!session,
    staleTime: 10 * 60_000,
    queryFn: async () => unwrap<boolean>(await supabase.rpc('is_admin')),
  });
}

export function useModerationQueue() {
  return useQuery({ queryKey: ['admin', 'queue'], queryFn: async () => unwrap<QueueRow[]>(await supabase.rpc('admin_moderation_queue')) });
}

export function usePausedStores() {
  return useQuery({
    queryKey: ['admin', 'paused'],
    queryFn: async () => unwrap<{ bookstore_id: string; store_name: string; slug: string }[]>(await supabase.rpc('admin_paused_stores')),
  });
}

export function useRecentFeedback() {
  return useQuery({
    queryKey: ['admin', 'feedback'],
    queryFn: async () =>
      unwrap<{ id: string; kind: string; body: string; app_version: string | null; created_at: string }[]>(await supabase.rpc('admin_recent_feedback')),
  });
}

export function useModerate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookstoreId, action }: { bookstoreId: string; action: 'pause' | 'restore' | 'dismiss' }) => {
      const res = await supabase.rpc('admin_moderate', { p_bookstore_id: bookstoreId, p_action: action });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] });
      qc.invalidateQueries({ queryKey: ['explore'] });
    },
  });
}
