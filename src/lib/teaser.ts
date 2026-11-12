/**
 * v1.8 AD 策展預告：下個月以後、還沒上架的策展可以先預告（一句話＋最多 3 本先公開的書）；讀者按「上架提醒我」。
 * 伺服器還沒套用 v1.8 時，預告查詢回空的。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { StoreColor } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { tr } from '@/lib/i18n';
import { rpcOr } from '@/lib/store-v16';
import { supabase } from '@/lib/supabase';

export type Teaser = {
  id: string;
  period: string;
  title: string | null;
  text: string | null;
  scheduled_for: string | null;
  books: { id: string; title: string; cover_url: string | null }[];
  hidden_count: number;
  waiting: number;
  reminded: boolean;
  store: { id: string; slug: string; name: string; color: StoreColor; avatar_path: string | null };
};

export function useStoreTeaser(slug: string | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['teaser', slug, session?.user.id ?? 'anon'],
    enabled: !!slug,
    queryFn: () => rpcOr<Teaser | null>('store_teaser', { p_slug: slug }, null),
  });
}

export function useExploreTeasers() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['teasers', session?.user.id ?? 'anon'],
    queryFn: () => rpcOr<Teaser[]>('explore_teasers', { p_limit: 10 }, []),
  });
}

export function useTeaserRemind() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      const res = await supabase.rpc('teaser_remind', { p_curation_id: id, p_on: on });
      if (res.error) throw new Error(res.error.message);
      return res.data as { reminded: boolean; waiting: number };
    },
    onSuccess: (_d, v) => {
      if (v.on) track('teaser_reminder_set', {});
      void qc.invalidateQueries({ queryKey: ['teaser'] });
      void qc.invalidateQueries({ queryKey: ['teasers'] });
    },
  });
}

/** 店主：這檔的預告設定（另外查，伺服器還沒套用 v1.8 時回 null，編輯頁照常） */
export function useTeaserSettings(curationId: string | undefined) {
  return useQuery({
    queryKey: ['teaser-settings', curationId],
    enabled: !!curationId,
    queryFn: async () => {
      const res = await supabase.from('curations').select('teaser_on, teaser_text, curation_items(id, teaser)').eq('id', curationId!).maybeSingle();
      if (res.error) return null;
      return res.data as { teaser_on: boolean; teaser_text: string | null; curation_items: { id: string; teaser: boolean }[] } | null;
    },
  });
}

export function useSetTeaser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, on, text, itemIds }: { id: string; on: boolean; text: string; itemIds: string[] }) => {
      const res = await supabase.rpc('set_teaser', { p_curation_id: id, p_on: on, p_text: text, p_item_ids: itemIds });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: (_d, v) => {
      if (v.on) track('teaser_published', { books: v.itemIds.length });
      void qc.invalidateQueries({ queryKey: ['teaser-settings', v.id] });
      void qc.invalidateQueries({ queryKey: ['teaser'] });
      void qc.invalidateQueries({ queryKey: ['teasers'] });
    },
  });
}

export function teaserError(m: string) {
  if (m.includes('teaser_not_upcoming')) return tr('只能預告下個月以後、還沒上架的策展。');
  if (m.includes('teaser_too_many_books')) return tr('最多先公開 3 本。');
  if (m.includes('teaser_gone')) return tr('這檔預告已經結束了。');
  if (/function|does not exist|schema cache/i.test(m)) return tr('伺服器還沒更新，稍後再試。');
  return tr('沒有成功，請稍後再試。');
}

/** 「12/1 上架」或「下個月上架」 */
export function teaserWhen(t: Pick<Teaser, 'scheduled_for' | 'period'>) {
  if (t.scheduled_for) {
    const d = new Date(new Date(t.scheduled_for).getTime() + 8 * 3600e3);
    return tr('{md} 上架', { md: `${d.getUTCMonth() + 1}/${d.getUTCDate()}` });
  }
  return tr('{m} 月上架', { m: Number(t.period.slice(5, 7)) });
}
