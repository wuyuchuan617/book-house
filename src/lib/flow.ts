/**
 * v1.9 流程調整：新用戶「開始的三步」、探索分頁數量、日記預設公開、月底排策展。
 * 伺服器還沒套用 v1.9 時都回安全的預設（不顯示、不問）。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { rpcOr } from '@/lib/store-v16';
import { supabase } from '@/lib/supabase';

export type Onboarding = { follows: number; saves: number; entries: number; dismissed: boolean };

export function useOnboarding() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['onboarding', session?.user.id ?? 'anon'],
    enabled: !!session,
    queryFn: () => rpcOr<Onboarding | null>('onboarding_progress', {}, null),
  });
}

export function useDismissOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await supabase.rpc('dismiss_onboarding');
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['onboarding'] }),
  });
}

/** 探索：書旅、處方箋滿 TAB_MIN 則才佔分頁。伺服器沒有這支函式時回 null（照舊全部顯示） */
export const TAB_MIN = 10;
export function useExploreCounts() {
  return useQuery({
    queryKey: ['explore-counts'],
    staleTime: 5 * 60_000,
    queryFn: () => rpcOr<{ trips: number; rx: number } | null>('explore_counts', {}, null),
  });
}

/** 日記預設公開：null＝還沒問過（第一次公開發布時問一次）；undefined＝伺服器還沒更新（不問） */
export function useDiaryPublicDefault() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['diary-public-default', session?.user.id ?? 'anon'],
    enabled: !!session,
    queryFn: async () => (await rpcOr<boolean | null | 'missing'>('my_diary_public_default', {}, 'missing')) ?? null,
  });
}

export function useSetDiaryPublicDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (isPublic: boolean) => {
      const res = await supabase.rpc('set_diary_public_default', { p_public: isPublic });
      if (res.error) throw new Error(res.error.message);
      return isPublic;
    },
    onSuccess: (v) => qc.setQueriesData({ queryKey: ['diary-public-default'] }, v),
  });
}

export type MonthWrap = {
  period: string;
  next_period: string;
  next_has_curation: boolean;
  notes: number;
  books: { book_id: string; title: string; cover_url: string | null; finished: boolean; first_note: string | null }[];
};

export function useMonthWrap(enabled: boolean) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['month-wrap', session?.user.id ?? 'anon'],
    enabled: enabled && !!session,
    queryFn: () => rpcOr<MonthWrap | null>('month_wrap', { p_period: null }, null),
  });
}
