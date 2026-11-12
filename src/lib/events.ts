/**
 * v1.8 AE 活動：分享看到的書市集、簽書會、講座…。活動是共用的一筆，每個人的分享掛在活動底下。
 * 伺服器還沒套用 v1.8 時，列表回空的。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Linking } from 'react-native';

import type { StoreColor } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { uploadDiaryPhotos, type DiaryPhoto } from '@/lib/diary';
import { currentLang, tr } from '@/lib/i18n';
import { rpcOr } from '@/lib/store-v16';
import { supabase } from '@/lib/supabase';

export type EventType = 'market' | 'signing' | 'talk' | 'club' | 'exhibit' | 'other';
export const EVENT_TYPES: EventType[] = ['market', 'signing', 'talk', 'club', 'exhibit', 'other'];
export const EVENT_TYPE_LABEL = (): Record<EventType, string> => ({
  market: tr('書市集'), signing: tr('簽書會'), talk: tr('講座'), club: tr('讀書會'), exhibit: tr('展覽'), other: tr('其他'),
});

type Person = { name: string; slug: string | null; color: StoreColor | null; avatar_path: string | null };

export type BookEvent = {
  id: string;
  title: string;
  event_type: EventType;
  starts_at: string;
  ends_at: string | null;
  online: boolean;
  url: string | null;
  place: { id: string; name: string; address: string | null } | null;
  share_count: number;
  sharers: Person[];
  latest: { body: string; name: string } | null;
  going_count: number;
  i_going: boolean;
  i_shared: boolean;
  mine: boolean;
};

export type EventShare = { id: string; body: string | null; photo_paths: string[]; created_at: string; is_mine: boolean; author: Person };
export type EventDetail = BookEvent & { over: boolean; shares: EventShare[] };

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: ['events'] });
  void qc.invalidateQueries({ queryKey: ['event'] });
  void qc.invalidateQueries({ queryKey: ['place-events'] });
};

export function useExploreEvents(enabled = true) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['events', 'explore', session?.user.id ?? 'anon'],
    enabled,
    queryFn: () => rpcOr<BookEvent[]>('explore_events', { p_limit: 30 }, []),
  });
}

export function useFindEvents(query: string) {
  const q = query.trim();
  const url = /^https?:\/\//i.test(q) ? q : null;
  return useQuery({
    queryKey: ['events', 'find', q],
    enabled: q.length >= 2,
    queryFn: () => rpcOr<BookEvent[]>('find_events', { p_query: url ? null : q, p_url: url, p_limit: 10 }, []),
  });
}

export function useEventDetail(id: string | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['event', id, session?.user.id ?? 'anon'],
    enabled: !!id,
    queryFn: () => rpcOr<EventDetail | null>('event_detail', { p_id: id }, null),
  });
}

export function usePlaceEvents(placeId: string | undefined) {
  return useQuery({
    queryKey: ['place-events', placeId],
    enabled: !!placeId,
    queryFn: () => rpcOr<BookEvent[]>('place_events', { p_place_id: placeId }, []),
  });
}

export type NewEvent = { title: string; type: EventType; startsAt: Date; endsAt: Date | null; placeId: string | null; online: boolean; url: string };

/** 新增活動：同一個連結、同地點同一天會回 duplicate，讓畫面問「是不是這個？」 */
export function useCreateEvent() {
  return useMutation({
    mutationFn: async ({ e, force }: { e: NewEvent; force?: boolean }) => {
      const res = await supabase.rpc('create_event', {
        p_title: e.title.trim(),
        p_type: e.type,
        p_starts_at: e.startsAt.toISOString(),
        p_ends_at: e.endsAt ? e.endsAt.toISOString() : null,
        p_place_id: e.placeId,
        p_online: e.online,
        p_url: e.url.trim() || null,
        p_force: !!force,
      });
      if (res.error) throw new Error(res.error.message);
      const data = res.data as { id?: string; duplicate?: BookEvent };
      if (data.id) track('event_created', { type: e.type });
      return data;
    },
  });
}

export function useShareEvent() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ eventId, body, going, photos }: { eventId: string; body: string; going: boolean; photos: DiaryPhoto[] }) => {
      const res = await supabase.rpc('share_event', { p_event_id: eventId, p_body: body.trim() || null, p_going: going });
      if (res.error) throw new Error(res.error.message);
      const { id } = res.data as { id: string };
      if (photos.length && session) {
        const paths = await uploadDiaryPhotos(session.user.id, id, photos);
        const up = await supabase.from('book_event_shares').update({ photo_paths: paths }).eq('id', id);
        if (up.error) throw new Error(up.error.message);
      }
      track('event_shared', { photos: photos.length, going });
      return id;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase.from('book_event_shares').delete().eq('id', id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useEventGo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      const res = await supabase.rpc('event_go', { p_event_id: id, p_on: on });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: (_d, v) => {
      if (v.on) track('event_going', {});
      invalidate(qc);
    },
  });
}

export function useReportEvent() {
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await supabase.from('book_event_reports').insert({ event_id: id, reason });
      if (res.error) throw new Error(res.error.message);
    },
  });
}

export function eventError(m: string) {
  if (m.includes('event_private_place')) return tr('私人地點不能用在活動；選公開場所，或選「線上」。');
  if (m.includes('event_already_over')) return tr('這個活動已經結束了。');
  if (m.includes('event_gone')) return tr('這個活動已經不在了。');
  if (m.includes('events_where')) return tr('選一個地點，或選「線上」。');
  if (/function|does not exist|schema cache/i.test(m)) return tr('伺服器還沒更新，稍後再試。');
  return tr('沒有成功，請稍後再試。');
}

const tp = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600e3);
const pad = (n: number) => String(n).padStart(2, '0');
const WEEK = () => (currentLang() === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['週日', '週一', '週二', '週三', '週四', '週五', '週六']);

/** 日曆塊：{ day: '14', week: '週六' } */
export function eventDay(iso: string) {
  const d = tp(iso);
  return { day: String(d.getUTCDate()), week: WEEK()[d.getUTCDay()] };
}

/** 「12/14 13:00–18:00」 */
export function eventTime(e: Pick<BookEvent, 'starts_at' | 'ends_at'>) {
  const s = tp(e.starts_at);
  const head = `${s.getUTCMonth() + 1}/${s.getUTCDate()} ${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}`;
  if (!e.ends_at) return head;
  const en = tp(e.ends_at);
  const sameDay = en.getUTCFullYear() === s.getUTCFullYear() && en.getUTCMonth() === s.getUTCMonth() && en.getUTCDate() === s.getUTCDate();
  return `${head}–${sameDay ? '' : `${en.getUTCMonth() + 1}/${en.getUTCDate()} `}${pad(en.getUTCHours())}:${pad(en.getUTCMinutes())}`;
}

export const eventWhere = (e: Pick<BookEvent, 'place' | 'online'>) => e.place?.name ?? (e.online ? tr('線上') : '');

/** 加入行事曆：開 Google 日曆的新增頁（iOS、Android、網頁都能用） */
export function addToCalendar(e: Pick<BookEvent, 'title' | 'starts_at' | 'ends_at' | 'place' | 'url'>) {
  const f = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = e.ends_at ?? new Date(new Date(e.starts_at).getTime() + 2 * 3600e3).toISOString();
  const params = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${f(e.starts_at)}/${f(end)}`, details: e.url ?? '', location: e.place ? `${e.place.name} ${e.place.address ?? ''}`.trim() : '' });
  track('event_calendar_added', {});
  void Linking.openURL(`https://calendar.google.com/calendar/render?${params}`);
}
