/**
 * v1.6 我的書店與通知：追蹤者／追蹤中名單、數據、書店的處方簽分頁、通知列表、搜尋處方簽。
 * 伺服器還沒套用 v1.6 migration 時，這些查詢會回空的（不讓整頁壞掉）。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { StoreColor } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { unwrap } from '@/lib/queries';
import type { RxListItem } from '@/lib/rx';
import { supabase } from '@/lib/supabase';

const missing = (m: string) => /function|does not exist|schema cache/i.test(m);

async function rpcOr<T>(fn: string, args: Record<string, unknown>, fallback: T): Promise<T> {
  const res = await supabase.rpc(fn, args);
  if (res.error && missing(res.error.message)) return fallback;
  return unwrap<T>(res);
}

export type FollowRow = {
  store_id: string;
  slug: string;
  name: string;
  color: StoreColor;
  avatar_path: string | null;
  tagline: string | null;
  since: string;
  latest: { period: string; title: string; book_count: number } | null;
  i_follow: boolean;
};

export function useMyFollowList(kind: 'followers' | 'following') {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['follow-list', session?.user.id, kind],
    enabled: !!session,
    queryFn: () => rpcOr<FollowRow[]>('my_follow_list', { p_kind: kind }, []),
  });
}

export type StoreInsights = {
  followers: number;
  following: number;
  visits_this_month: number;
  visits_last_month: number;
  visitors_this_month: number;
  saves_from_store: number;
  published_curations: number;
  public_posts: number;
  rx_replies_given: number;
  top_curations: { id: string; title: string; period: string; visits: number; saves: number }[];
};

export function useStoreInsights() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['store-insights', session?.user.id],
    enabled: !!session,
    queryFn: () => rpcOr<StoreInsights | null>('my_store_insights', {}, null),
  });
}

export type StoreRxItem = RxListItem & { closed_at: string | null; anonymous: boolean; wanted_count: number };

/** 書店頁 › 處方簽：店主發起的（不含匿名） */
export function useStoreRx(slug: string | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['store-rx', slug, session?.user.id ?? 'anon'],
    enabled: !!slug,
    queryFn: () => rpcOr<StoreRxItem[]>('store_rx', { p_slug: slug }, []),
  });
}

export function useRxSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['rx-search', q],
    enabled: q.length > 0,
    queryFn: () => rpcOr<RxListItem[]>('rx_search', { p_query: q, p_limit: 20 }, []),
  });
}

export type InboxItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  data: { url?: string } & Record<string, unknown>;
  created_at: string;
  read: boolean;
};

export function useInbox() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['inbox', session?.user.id],
    enabled: !!session,
    staleTime: 30_000,
    queryFn: () => rpcOr<{ unread: number; items: InboxItem[] }>('my_notifications', { p_limit: 60 }, { unread: 0, items: [] }),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id?: string) => {
      const res = await supabase.rpc('mark_notifications_read', { p_id: id ?? null });
      if (res.error && !missing(res.error.message)) throw new Error(res.error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  });
}
