/** M12 本週回顧（W1–W5） */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireOptionalNativeModule } from 'expo';
import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';

import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { addDays } from '@/lib/diary';
import { currentLang, tr } from '@/lib/i18n';
import { taipeiToday } from '@/lib/period';
import { unwrap } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type { NoteKind } from '@/lib/browse';

export const REFLECTION_MAX = 200;
export const NEXT_BOOKS_MAX = 3;

type MiniBook = { id: string; title: string; cover_url: string | null };

export type WeekReview = {
  week_start: string;
  week_end: string;
  is_current: boolean;
  days: { day: string; active: boolean }[];
  counts: { active_days: number; notes: number; checkins: number; reading_notes: number; saved: number; started: number; finished: number };
  books: (MiniBook & { count: number; started: boolean; finished: boolean })[];
  quotes: { id: string; reading_id: string; kind: NoteKind; body: string; page_ref: string | null; book_title: string }[];
  photos: { bucket: 'diary' | 'note-images'; path: string }[];
  places: { place_id: string | null; name: string; count: number }[];
  store: { visits: number; new_followers: number; saves: number; top_curation: { id: string; title: string; visits: number } | null } | null;
  reflection: { body: string | null; next_books: MiniBook[]; opened_at: string | null; editable: boolean };
  last_week_next: (MiniBook & { read: boolean })[];
  suggestion: MiniBook | null;
};

/** 台北的週一 */
export function weekStartOf(date: string) {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -dow);
}
export const lastWeekStart = () => weekStartOf(addDays(taipeiToday(), -7));
export const thisWeekStart = () => weekStartOf(taipeiToday());

/** '11/2–11/8' */
export function weekLabel(ws: string) {
  const we = addDays(ws, 6);
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return `${md(ws)}–${md(we)}`;
}

export function weekTitle(ws: string) {
  if (ws === thisWeekStart()) return tr('本週到目前');
  if (ws === lastWeekStart()) return tr('上週回顧');
  return tr('{range} 的回顧', { range: weekLabel(ws) });
}

export const isEmptyWeek = (w: WeekReview) => w.counts.active_days === 0 && w.counts.saved === 0 && w.counts.started === 0 && w.counts.finished === 0;

export function useWeekReview(weekStart?: string) {
  const { session } = useAuth();
  const ws = weekStart ?? lastWeekStart();
  return useQuery({
    queryKey: ['week-review', session?.user.id, ws],
    enabled: !!session,
    queryFn: async () => unwrap<WeekReview>(await supabase.rpc('my_week_review', { p_week_start: ws })),
  });
}

export type WeekSummary = { week_start: string; active_days: number; reading_notes: number; has_reflection: boolean };

export function useWeekList(limit = 12) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['week-list', session?.user.id, limit],
    enabled: !!session,
    queryFn: async () => unwrap<WeekSummary[]>(await supabase.rpc('my_week_list', { p_limit: limit })),
  });
}

export function useMarkWeekOpened() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ws: string) => {
      const res = await supabase.rpc('mark_week_opened', { p_week_start: ws });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['week-review'] }),
  });
}

export function useSaveReflection() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ ws, body, nextBookIds }: { ws: string; body: string; nextBookIds: string[]; prevNextIds: string[] }) => {
      const res = await supabase
        .from('weekly_reflections')
        .upsert({ user_id: session!.user.id, week_start: ws, body: body.trim() || null, next_book_ids: nextBookIds.slice(0, NEXT_BOOKS_MAX) }, { onConflict: 'user_id,week_start' });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: (_d, v) => {
      if (v.body.trim()) track('weekly_reflection_saved', { length: [...v.body.trim()].length });
      if (v.nextBookIds.join() !== v.prevNextIds.join()) track('weekly_next_books_set', { count: v.nextBookIds.length });
      qc.invalidateQueries({ queryKey: ['week-review'] });
      qc.invalidateQueries({ queryKey: ['week-list'] });
    },
  });
}

/** 回顧裡的照片可能來自日記（diary）或心得（note-images）兩個 bucket */
export function useWeekPhotoUrls(photos: WeekReview['photos'] | undefined) {
  const key = (photos ?? []).map((p) => `${p.bucket}:${p.path}`).join('|');
  return useQuery({
    queryKey: ['week-photos', key],
    enabled: !!key,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const list = photos ?? [];
      const out: (string | null)[] = list.map(() => null);
      for (const bucket of ['diary', 'note-images'] as const) {
        const idx = list.map((p, i) => (p.bucket === bucket ? i : -1)).filter((i) => i >= 0);
        if (!idx.length) continue;
        const { data } = await supabase.storage.from(bucket).createSignedUrls(idx.map((i) => list[i].path), 3600);
        idx.forEach((i, j) => (out[i] = data?.[j]?.signedUrl ?? null));
      }
      return out;
    },
  });
}

export function reflectionError(message: string) {
  if (message.includes('no longer be edited')) return tr('這週的回顧已經不能修改了。');
  if (message.includes('body_check')) return tr('一句話回顧最多 {n} 字。', { n: REFLECTION_MAX });
  return message;
}

// ---------------------------------------------------------------------------
// W4 分享圖：畫面轉圖片（react-native-view-shot）＋系統分享（expo-sharing）。
// 兩個都是原生模組：還沒重新打包的舊版 App 沒有，就不顯示「分享」。
// ---------------------------------------------------------------------------
export function shareImageAvailable() {
  if (Platform.OS === 'web') return false;
  try {
    const shot = TurboModuleRegistry.get('RNViewShot') ?? NativeModules.RNViewShot;
    return !!shot && !!requireOptionalNativeModule('ExpoSharing');
  } catch {
    return false;
  }
}

export async function shareViewAsImage(view: Parameters<typeof import('react-native-view-shot').captureRef>[0] | null) {
  if (!view) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { captureRef } = require('react-native-view-shot') as typeof import('react-native-view-shot');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sharing = require('expo-sharing') as typeof import('expo-sharing');
  const uri = await captureRef(view, { format: 'png', quality: 1, result: 'tmpfile' });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: currentLang() === 'en' ? 'Share my week' : '分享我的一週', UTI: 'public.png' });
}
