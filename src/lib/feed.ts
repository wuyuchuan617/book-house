/**
 * v1.8.3 AK21 探索 › 追蹤：追蹤書店的新動態（同一間書店、同一天合成一組）。
 * 伺服器還沒套用 v1.8.3 時，回空的。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { StoreColor } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { rpcOr } from '@/lib/store-v16';
import { supabase } from '@/lib/supabase';

export type FeedKind = 'curation' | 'teaser' | 'post' | 'reading_started' | 'reading_finished' | 'trip' | 'rx' | 'rx_reply' | 'event_share';

export type FeedItem = {
  kind: FeedKind;
  at: string;
  ref: string;
  data: {
    title?: string | null;
    period?: string;
    book_count?: number;
    covers?: { title: string; cover_url: string | null }[];
    entry_kind?: string;
    body?: string;
    place?: string | null;
    book?: { id: string; title: string } | null;
    city?: string;
    starts_at?: string;
    link?: string | null;
    link_title?: string | null;
  };
};

export type FeedGroup = {
  store: { id: string; slug: string; name: string; color: StoreColor; avatar_path: string | null };
  day: string;
  latest_at: string;
  items: FeedItem[];
  more: number;
};

export type Feed = { seen_at: string | null; groups: FeedGroup[] };

export type SuggestedStore = { id: string; slug: string; name: string; color: StoreColor; avatar_path: string | null; follower_count: number; reason: 'curation' | 'post' | null };

export function useFollowingFeed(enabled = true) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['feed', session?.user.id ?? 'anon'],
    enabled: enabled && !!session,
    queryFn: () => rpcOr<Feed>('following_feed', { p_before: null, p_limit: 30 }, { seen_at: null, groups: [] }),
  });
}

export function useFeedUnread() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['feed-unread', session?.user.id ?? 'anon'],
    enabled: !!session,
    staleTime: 60_000,
    queryFn: () => rpcOr<boolean>('feed_unread', {}, false),
  });
}

export function useMarkFeedSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await supabase.rpc('mark_feed_seen');
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => qc.setQueriesData({ queryKey: ['feed-unread'] }, false),
  });
}

export function useSuggestStores(enabled: boolean) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['suggest-stores', session?.user.id ?? 'anon'],
    enabled,
    queryFn: () => rpcOr<SuggestedStore[]>('suggest_stores', { p_limit: 5 }, []),
  });
}
