/** M10 閱讀日記（D1–D7）與書的地方（L1–L3） */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Linking } from 'react-native';

import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { userMessage } from '@/lib/errors';
import { currentLang, tr } from '@/lib/i18n';
import type { Coords } from '@/lib/location';
import { unwrap } from '@/lib/queries';
import type { ReportReason } from '@/lib/safety';
import { supabase } from '@/lib/supabase';
import type { NoteKind } from '@/lib/browse';

export const DIARY_BODY_MAX = 500;
export const DIARY_PHOTO_MAX = 3;
export const PLACE_LABEL_MAX = 60;
const DIARY_BUCKET = 'diary';

/** 地點類型（v1.4 起由使用者選；沒人選就是 null） */
export type PlaceCategory = 'bookstore' | 'indie' | 'library' | 'cafe' | 'park' | 'museum' | 'other';
export const PLACE_CATEGORIES: PlaceCategory[] = ['bookstore', 'indie', 'library', 'cafe', 'park', 'museum', 'other'];

/** 探索的類型篩選（「書店」也包含獨立書店） */
export type PlaceFilter = PlaceCategory;
export const PLACE_FILTERS: PlaceFilter[] = PLACE_CATEGORIES;

/** 類型名稱；沒有類型（沒人選）回傳空字串，呼叫端用 filter(Boolean) 略過 */
export function categoryLabel(c: PlaceFilter | string | null | undefined, isIndie?: boolean) {
  if (isIndie && c === 'bookstore') return tr('獨立書店');
  if (!c) return '';
  switch (c) {
    case 'indie':
      return tr('獨立書店');
    case 'bookstore':
      return tr('書店');
    case 'library':
      return tr('圖書館');
    case 'cafe':
      return tr('咖啡店');
    case 'park':
      return tr('公園');
    case 'museum':
      return tr('美術館・博物館');
    default:
      return tr('其他');
  }
}

type IconName = 'book' | 'book-open' | 'coffee' | 'sun' | 'image' | 'map-pin';
const CATEGORY_ICON: Record<string, IconName> = { bookstore: 'book', indie: 'book', library: 'book-open', cafe: 'coffee', park: 'sun', museum: 'image' };
export const categoryIcon = (c: string | null | undefined): IconName => CATEGORY_ICON[c ?? ''] ?? 'map-pin';

type DiaryBook = { id: string; title: string; cover_url: string | null };

export type DiaryItem =
  | {
      type: 'note' | 'checkin';
      id: string;
      at: string;
      body: string | null;
      photo_paths: string[];
      is_public: boolean;
      place_id: string | null;
      place_label: string | null;
      place_name: string | null;
      place_address: string | null;
      place_public_ok: boolean | null;
      google_place_id: string | null;
      place_category: PlaceCategory | null;
      reading_note_id: string | null;
      reading_id: string | null;
      note_public: boolean | null;
      page_ref?: string | null;
      book: DiaryBook | null;
    }
  | { type: 'reading_note'; id: string; at: string; reading_id: string; kind: NoteKind; is_public: boolean; title: string | null; body: string; book: DiaryBook }
  | { type: 'saved'; id: string; at: string; source: string | null; book: DiaryBook }
  | { type: 'want_place'; id: string; at: string; note: string | null; place_name: string; place_category: PlaceCategory | null }
  | { type: 'started' | 'finished'; id: string; at: null; reading_id: string; is_public: boolean; book: DiaryBook };

export type DiaryEntry = Extract<DiaryItem, { type: 'note' | 'checkin' }>;
export type DiaryDay = { date: string; is_today: boolean; items: DiaryItem[] };
export type Streak = { current_streak: number; longest_streak: number; month_days: number; today_done: boolean };

function invalidateDiary(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['diary-day'] });
  qc.invalidateQueries({ queryKey: ['diary-streak'] });
  qc.invalidateQueries({ queryKey: ['diary-active'] });
  qc.invalidateQueries({ queryKey: ['recent-places'] });
  qc.invalidateQueries({ queryKey: ['place'] });
  qc.invalidateQueries({ queryKey: ['explore-places'] });
  qc.invalidateQueries({ queryKey: ['saved-places'] });
  qc.invalidateQueries({ queryKey: ['explore-posts'] });
  qc.invalidateQueries({ queryKey: ['store-journal'] });
}

// ---------------------------------------------------------------------------
// 日記：讀取
// ---------------------------------------------------------------------------
export function useDiaryDay(date?: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['diary-day', session?.user.id, date ?? 'today'],
    enabled: !!session,
    queryFn: async () => unwrap<DiaryDay>(await supabase.rpc('my_diary_day', { p_date: date ?? null })),
  });
}

export function useDiaryStreak() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['diary-streak', session?.user.id],
    enabled: !!session,
    queryFn: async () =>
      unwrap<Streak | null>(await supabase.rpc('my_diary_streak').maybeSingle()) ?? { current_streak: 0, longest_streak: 0, month_days: 0, today_done: false },
  });
}

/** 一段期間內有記錄的日子（D5 月曆、D1 本週七格） */
export function useActiveDays(from: string, to: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['diary-active', session?.user.id, from, to],
    enabled: !!session,
    queryFn: async () => unwrap<{ day: string; entries: number; notes: number }[]>(await supabase.rpc('my_active_days', { p_from: from, p_to: to })),
  });
}

export type RecentPlace = { place_id: string | null; place_label: string | null; name: string | null; category: PlaceCategory | null; public_ok: boolean | null; google_place_id: string | null };

export function useRecentPlaces(enabled = true) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['recent-places', session?.user.id],
    enabled: !!session && enabled,
    queryFn: async () => unwrap<RecentPlace[]>(await supabase.rpc('my_recent_places')),
  });
}

// ---------------------------------------------------------------------------
// 日記：寫入（只能記今天，資料庫也會擋）
// ---------------------------------------------------------------------------
export type DiaryPhoto = { path: string } | { uri: string; mimeType?: string | null };

export type DiaryInput = {
  kind: 'note' | 'checkin';
  bookId: string | null;
  body: string;
  placeId: string | null;
  placeLabel: string | null;
  photos: DiaryPhoto[];
  isPublic: boolean;
  /** 正在讀：讀到第幾頁 */
  pageRef?: string | null;
  /** 同時存成的心得（日記筆記選了店主閱讀裡的書） */
  readingNoteId?: string | null;
};

async function uploadDiaryPhotos(userId: string, entryId: string, photos: DiaryPhoto[]) {
  const paths: string[] = [];
  for (const [i, p] of photos.entries()) {
    if ('path' in p) {
      paths.push(p.path);
      continue;
    }
    const type = p.mimeType && ['image/jpeg', 'image/png', 'image/webp'].includes(p.mimeType) ? p.mimeType : 'image/jpeg';
    const body = await (await fetch(p.uri)).arrayBuffer();
    if (body.byteLength > 5 * 1024 * 1024) throw new Error(tr('圖片超過 5MB，請選一張小一點的。'));
    const path = `${userId}/${entryId}/${Date.now()}-${i}.${type.split('/')[1].replace('jpeg', 'jpg')}`;
    const { error } = await supabase.storage.from(DIARY_BUCKET).upload(path, body, { contentType: type, upsert: false });
    if (error) throw new Error(tr('上傳沒有成功：{message}', { message: error.message }));
    paths.push(path);
  }
  return paths;
}

export function useSaveEntry() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ entryId, input, previousPaths = [] }: { entryId?: string; input: DiaryInput; previousPaths?: string[] }) => {
      const userId = session?.user.id;
      if (!userId) throw new Error('sign in required');
      const checkin = input.kind === 'checkin';
      // 新的一筆先在手機產生 id，照片先上傳到 {user_id}/{entry_id}/，再一次寫入
      const id = entryId ?? newUuid();
      const paths = await uploadDiaryPhotos(userId, id, input.photos);
      const fields = {
        kind: input.kind,
        book_id: input.bookId,
        body: input.body.trim() || null,
        place_id: checkin ? input.placeId : null,
        place_label: checkin && !input.placeId ? input.placeLabel?.trim().slice(0, PLACE_LABEL_MAX) || null : null,
        // v1.5 日記貼文：沒有地點也能公開；自己輸入的地點不能公開
        is_public: input.isPublic && !(checkin && !input.placeId),
        page_ref: input.pageRef?.trim().slice(0, 20) || null,
        photo_paths: paths,
        ...(input.readingNoteId ? { reading_note_id: input.readingNoteId } : {}),
      };
      let res = entryId ? await supabase.from('diary_entries').update(fields).eq('id', id) : await supabase.from('diary_entries').insert({ id, ...fields });
      // 資料庫還沒套用 v1.5 ②（沒有 page_ref）：不帶頁數再存一次
      if (res.error && /page_ref/i.test(res.error.message)) {
        const { page_ref: _omit, ...old } = fields;
        void _omit;
        res = entryId ? await supabase.from('diary_entries').update(old).eq('id', id) : await supabase.from('diary_entries').insert({ id, ...old });
      }
      if (res.error) {
        const fresh = paths.filter((p) => !previousPaths.includes(p));
        if (fresh.length) await supabase.storage.from(DIARY_BUCKET).remove(fresh).then(() => {}, () => {});
        throw new Error(res.error.message);
      }
      const removed = previousPaths.filter((p) => !paths.includes(p));
      if (removed.length) await supabase.storage.from(DIARY_BUCKET).remove(removed).then(() => {}, () => {});
      return { id, isNew: !entryId };
    },
    onSuccess: (r, v) => {
      if (r.isNew) {
        track('diary_entry_created', {
          kind: v.input.kind,
          has_book: !!v.input.bookId,
          has_text: !!v.input.body.trim(),
          photo_count: v.input.photos.length,
          public: v.input.isPublic && !(v.input.kind === 'checkin' && !v.input.placeId),
          google_place: !!v.input.placeId,
          also_note: !!v.input.readingNoteId,
        });
      }
      invalidateDiary(qc);
    },
  });
}

export function useDeleteEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, photoPaths = [] }: { id: string; photoPaths?: string[] }) => {
      const res = await supabase.from('diary_entries').delete().eq('id', id);
      if (res.error) throw new Error(res.error.message);
      if (photoPaths.length) await supabase.storage.from(DIARY_BUCKET).remove(photoPaths).then(() => {}, () => {});
    },
    onSuccess: () => invalidateDiary(qc),
  });
}

/** 公開的打卡隨時可以改回私人（其他欄位不動，過了當天也可以） */
export function useUnpublishEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase.from('diary_entries').update({ is_public: false }).eq('id', id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => invalidateDiary(qc),
  });
}

/** 日記與公開打卡的照片（非公開 bucket）→ 1 小時有效的網址 */
export function useDiaryImageUrls(paths: string[] | undefined) {
  const key = (paths ?? []).join('|');
  return useQuery({
    queryKey: ['diary-images', key],
    enabled: !!key,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(DIARY_BUCKET).createSignedUrls(key.split('|'), 3600);
      if (error) throw new Error(error.message);
      return (data ?? []).map((d) => d.signedUrl ?? null);
    },
  });
}

// ---------------------------------------------------------------------------
// 選地點（D7）：Edge Function place-search 代理 Google Places（只用免費的 Essentials）
// ---------------------------------------------------------------------------
export type PlaceSuggestion = { googlePlaceId: string; name: string; address: string | null; types: string[]; category: PlaceCategory; public_ok: boolean };
export type PickedPlace = { id: string; name: string; address: string | null; category: PlaceCategory | null; public_ok: boolean; google_place_id: string };

export class PlaceSearchError extends Error {
  constructor(public code: 'quota' | 'not_configured' | 'other', message: string) {
    super(message);
  }
}

/** UUID v4（日記的 id、Google 的 session token：一次搜尋到選定算一個 session） */
export function newUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function invokePlaces<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('place-search', { body });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 429) throw new PlaceSearchError('quota', tr('今天的地點搜尋次數用完了，可以直接輸入地點名稱。'));
    if (status === 503 || status === 404) throw new PlaceSearchError('not_configured', tr('地點搜尋還沒開放，可以直接輸入地點名稱。'));
    throw new PlaceSearchError('other', tr('地點搜尋沒有成功，可以直接輸入地點名稱。'));
  }
  return data as T;
}

export function usePlaceSearch(input: string, sessionToken: string, near: Coords | null) {
  const q = input.trim();
  return useQuery({
    queryKey: ['place-search', q, near?.lat, near?.lng],
    enabled: [...q].length >= 2,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async () =>
      (await invokePlaces<{ suggestions: PlaceSuggestion[] }>({ action: 'autocomplete', input: q, sessionToken, lat: near?.lat, lng: near?.lng, language: currentLang() === 'en' ? 'en' : 'zh-TW' })).suggestions,
  });
}

/** 選定一個 Google 地點 → 存進 places，回傳我們自己的 place id */
export async function selectPlace(s: PlaceSuggestion | RecentPlace, sessionToken: string, needLocation: boolean): Promise<PickedPlace> {
  const body =
    'googlePlaceId' in s
      ? { googlePlaceId: s.googlePlaceId, name: s.name, address: s.address, types: s.types }
      : { googlePlaceId: s.google_place_id, name: s.name, address: null, types: [] };
  const { place } = await invokePlaces<{ place: PickedPlace }>({ action: 'select', ...body, sessionToken, needLocation });
  track('place_saved', { category: place.category, public_ok: place.public_ok });
  return place;
}

// ---------------------------------------------------------------------------
// 書的地方（L1–L3）
// ---------------------------------------------------------------------------
export type PublicCheckin = {
  id: string;
  entry_date: string;
  body: string | null;
  photo_paths: string[];
  book_id: string | null;
  book_title: string | null;
  book_cover_url: string | null;
  author_name: string;
  author_store_slug: string | null;
  author_store_color: string | null;
  author_avatar_path: string | null;
};

export type PlaceDetail = {
  place: { id: string; name: string; address: string | null; category: PlaceCategory | null; public_ok: boolean; google_place_id: string };
  is_indie: boolean;
  category_override: PlaceCategory | null;
  type_votes: Partial<Record<PlaceCategory, number>>;
  my_type: PlaceCategory | null;
  my_note: string | null;
  checkin_count: number;
  save_count: number;
  saved: boolean;
  my_checkins: number;
  books: DiaryBook[];
  checkins: PublicCheckin[];
};

export function usePlaceDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['place', id],
    enabled: !!id,
    queryFn: async () => unwrap<PlaceDetail | null>(await supabase.rpc('place_detail', { p_place_id: id })),
  });
}

export type PlaceSort = 'near' | 'latest' | 'saves';
export type ExplorePlace = {
  id: string;
  name: string;
  address: string | null;
  category: PlaceCategory | null;
  checkin_count: number;
  save_count: number;
  last_checkin: string | null;
  distance_m: number | null;
  photo_paths: string[];
  saved: boolean;
  is_indie: boolean;
};

export function useExplorePlaces(sort: PlaceSort, category: PlaceFilter | undefined, near: Coords | null) {
  return useQuery({
    queryKey: ['explore-places', sort, category ?? 'all', sort === 'near' ? near?.lat : null, sort === 'near' ? near?.lng : null],
    queryFn: async () =>
      unwrap<ExplorePlace[]>(
        await supabase.rpc('explore_places', {
          p_sort: sort,
          p_category: category ?? null,
          p_lat: near?.lat ?? null,
          p_lng: near?.lng ?? null,
          p_limit: 50,
        }),
      ),
  });
}

export const PLACE_NOTE_MAX = 100;

/** 書櫃 › 地方：想去（存了還沒去）／去過（自己打過卡） */
export type MyPlaceKind = 'want' | 'visited';
export type MyPlace = {
  id: string;
  name: string;
  address: string | null;
  category: PlaceCategory | null;
  is_indie: boolean;
  saved: boolean;
  note: string | null;
  saved_at: string | null;
  my_checkins: number;
  last_visit: string | null;
  checkin_count: number;
  photo_paths: string[];
};

export function useMyPlaces(kind: MyPlaceKind) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['saved-places', session?.user.id, kind],
    enabled: !!session,
    queryFn: async () => unwrap<MyPlace[]>(await supabase.rpc('my_places', { p_kind: kind })),
  });
}

function invalidatePlace(qc: QueryClient, placeId: string) {
  qc.invalidateQueries({ queryKey: ['place', placeId] });
  qc.invalidateQueries({ queryKey: ['explore-places'] });
  qc.invalidateQueries({ queryKey: ['saved-places'] });
}

/** 存成想去（可以寫一句為什麼想去）／移除；type = 順便選這個地點的類型 */
/** 連結：空白 → null；沒寫 http 就補 https:// */
export function normalizeLink(link: string | null | undefined) {
  const t = link?.trim();
  if (!t) return null;
  return (/^https?:\/\//i.test(t) ? t : `https://${t}`).slice(0, 500);
}

// ---------------------------------------------------------------------------
// 店主手記（G2 自己看、G4 讀者看）：想讀、想去、日記貼文
// ---------------------------------------------------------------------------
type JournalBase = { id: string; at: string; is_public: boolean; shown: boolean };
export type JournalItem =
  | (JournalBase & { type: 'want'; note: string | null; source_text: string | null; book: DiaryBook & { authors: string[] } })
  | (JournalBase & { type: 'place'; note: string | null; public_ok: boolean; place: { id: string; name: string; category: PlaceCategory | null } })
  | (JournalBase & {
      type: 'post';
      kind: 'note' | 'checkin';
      entry_date: string;
      body: string | null;
      photo_paths: string[];
      page_ref: string | null;
      place: { id: string; name: string } | null;
      place_label?: string | null;
      book: DiaryBook | null;
    })
  | (JournalBase & { type: 'rx_reply'; reason: string; prescription: { id: string; title: string }; book: DiaryBook })
  | (JournalBase & { type: 'rx'; title: string; reply_count: number; is_open: boolean });

export function useStoreJournal(bookstoreId: string | undefined) {
  return useQuery({
    queryKey: ['store-journal', bookstoreId],
    enabled: !!bookstoreId,
    queryFn: async () => unwrap<JournalItem[]>(await supabase.rpc('store_journal', { p_bookstore_id: bookstoreId })),
  });
}

/** 店主手記裡改一則公不公開（貼文：公開只能在當天打開，隨時可以關掉） */
export function useSetJournalPublic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, value }: { item: JournalItem; value: boolean }) => {
      if (item.type === 'rx' || item.type === 'rx_reply') return;
      const res =
        item.type === 'want'
          ? await supabase.from('book_saves').update({ is_public: value }).eq('book_id', item.id)
          : item.type === 'place'
            ? await supabase.from('place_saves').update({ is_public: value }).eq('place_id', item.id)
            : await supabase.from('diary_entries').update({ is_public: value }).eq('id', item.id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-journal'] });
      qc.invalidateQueries({ queryKey: ['saves'] });
      invalidateDiary(qc);
    },
  });
}

export function useSavePlace() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ placeId, save, note, type, link, isPublic }: { placeId: string; save: boolean; note?: string | null; type?: PlaceCategory | null; from?: string; link?: string | null; isPublic?: boolean }) => {
      if (!save) {
        const res = await supabase.from('place_saves').delete().eq('place_id', placeId);
        if (res.error) throw new Error(res.error.message);
        return;
      }
      const base = { user_id: session!.user.id, place_id: placeId, note: note?.trim().slice(0, PLACE_NOTE_MAX) || null };
      const extra = { ...(link !== undefined ? { link: normalizeLink(link) } : {}), ...(isPublic !== undefined ? { is_public: isPublic } : {}) };
      let res = await supabase.from('place_saves').upsert({ ...base, ...extra }, { onConflict: 'user_id,place_id' });
      // 資料庫還沒套用 v1.5 ②：先存原本的欄位
      if (res.error && Object.keys(extra).length && /link|is_public|column/i.test(res.error.message)) {
        res = await supabase.from('place_saves').upsert(base, { onConflict: 'user_id,place_id' });
      }
      if (res.error) throw new Error(res.error.message);
      if (type) await supabase.rpc('set_place_type', { p_place_id: placeId, p_category: type });
    },
    onSuccess: (_d, v) => {
      if (v.save) track('place_saved', { from: v.from ?? 'place_page', has_note: !!v.note?.trim(), type: v.type ?? null });
      invalidatePlace(qc, v.placeId);
    },
  });
}

/** 選這個地點的類型（null = 取消）；顯示的是大家選最多的那個 */
export function useSetPlaceType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ placeId, type }: { placeId: string; type: PlaceCategory | null }) =>
      unwrap<PlaceCategory | null>(await supabase.rpc('set_place_type', { p_place_id: placeId, p_category: type })),
    onSuccess: (_d, v) => invalidatePlace(qc, v.placeId),
  });
}

/** 管理員修正類型（null = 交回給使用者） */
export function useAdminCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ placeId, value }: { placeId: string; value: PlaceCategory | null }) => {
      const res = await supabase.rpc('admin_set_place_category', { p_place_id: placeId, p_category: value });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: (_d, v) => invalidatePlace(qc, v.placeId),
  });
}

export function useReportCheckin() {
  return useMutation({
    mutationFn: async (input: { entryId: string; reason: ReportReason; detail?: string }) => {
      const res = await supabase.rpc('report_checkin', { p_entry_id: input.entryId, p_reason: input.reason, p_detail: input.detail?.trim() || null });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: (_d, v) => track('report_submitted', { reason: v.reason, target: 'checkin' }),
  });
}

/** 在 Google 地圖開啟（Maps URLs，不需要金鑰、不計費） */
export function openInGoogleMaps(name: string, googlePlaceId?: string | null) {
  const q = encodeURIComponent(name);
  const url = `https://www.google.com/maps/search/?api=1&query=${q}${googlePlaceId ? `&query_place_id=${encodeURIComponent(googlePlaceId)}` : ''}`;
  track('place_maps_opened', {});
  void Linking.openURL(url);
}

export const formatDistance = (m: number | null) => (m == null ? null : m < 1000 ? tr('{n} 公尺', { n: Math.round(m / 10) * 10 }) : tr('{n} 公里', { n: (m / 1000).toFixed(m < 10_000 ? 1 : 0) }));

/** 'YYYY-MM-DD' → '11/9（一）' */
export function dayLabel(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const w = d.getUTCDay();
  if (currentLang() === 'en') return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][w]} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${'日一二三四五六'[w]}）`;
}

export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function diaryError(message: string) {
  if (message.includes('only be written for today')) return tr('日記只能記今天的。');
  if (message.includes('cannot be public')) return tr('這個地點不能公開打卡，只有公開場所可以分享。');
  if (message.includes('content not allowed')) return tr('內容含有不適合公開的字詞，請修改後再試。');
  if (message.includes('diary_has_content')) return tr('寫一句話或加一張照片。');
  if (message.includes('diary_public_checkin')) return tr('伺服器還沒更新到新版，沒有地點的日記暫時不能公開；先存成只有自己，更新後就可以。');
  if (message.includes('diary_checkin_place')) return tr('打卡要選一個地點。');
  if (message.includes('already reported')) return tr('你已經檢舉過這則打卡了。');
  if (message.includes('place_type_votes_category_check')) return tr('沒有這個類型。');
  if (message.includes('place_saves_note_check')) return tr('想去的原因最多 {n} 字。', { n: PLACE_NOTE_MAX });
  return userMessage(message);
}

// ---------------------------------------------------------------------------
// 探索 › 貼文（E1）
// ---------------------------------------------------------------------------
export type PostFilter = 'all' | 'following' | 'near';
export type PublicPost = {
  id: string;
  created_at: string;
  entry_date: string;
  kind: 'note' | 'checkin';
  body: string | null;
  photo_paths: string[];
  page_ref: string | null;
  book_id: string | null;
  book_title: string | null;
  book_cover_url: string | null;
  place_id: string | null;
  place_name: string | null;
  place_category: PlaceCategory | null;
  author_name: string;
  author_store_slug: string | null;
  author_store_color: string | null;
  author_avatar_path: string | null;
  is_mine: boolean;
  distance_m: number | null;
};

export function useExplorePosts(filter: PostFilter, near: Coords | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['explore-posts', session?.user.id ?? 'anon', filter, near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : null],
    enabled: filter !== 'near' || !!near,
    queryFn: async () =>
      unwrap<PublicPost[]>(
        await supabase.rpc('explore_posts', { p_filter: filter, p_lat: near?.lat ?? null, p_lng: near?.lng ?? null, p_limit: 50 }),
      ),
  });
}
