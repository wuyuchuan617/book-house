/** M3 逛店與互動：探索、追蹤、收藏、店主閱讀（讀者唯讀）、書籍視角 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { StoreColor } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import type { Book } from '@/lib/curations';
import { track } from '@/lib/analytics';
import { getVisitorKey, unwrap, type ExploreItem, type PublicStore } from '@/lib/queries';
import { previousPeriod } from '@/lib/period';
import { supabase } from '@/lib/supabase';
import { tr } from '@/lib/i18n';

const BOOK_COLS = 'id, source, title, authors, cover_url, published_year, publisher';

// ---------------------------------------------------------------------------
// A2 探索
// ---------------------------------------------------------------------------
export function useExploreFeed({ tag, query }: { tag?: string; query?: string }) {
  const q = query?.trim() ?? '';
  return useQuery({
    queryKey: ['explore', tag ?? 'all', q],
    queryFn: async () => {
      if (q) {
        const rows = unwrap<ExploreItem[]>(await supabase.rpc('search_explore', { p_query: q }));
        return tag ? rows.filter((r) => r.tag_slugs.includes(tag)) : rows;
      }
      let req = supabase.from('explore_feed').select('*').order('published_at', { ascending: false }).limit(50);
      if (tag) req = req.contains('tag_slugs', [tag]);
      return unwrap<ExploreItem[]>(await req);
    },
  });
}

/** A2 冷啟動：本月策展不到 6 檔時，用上個月的策展補位（月初、店主還少的時候） */
export const EXPLORE_MIN = 6;
export function usePreviousMonthFeed({ tag, enabled }: { tag?: string; enabled: boolean }) {
  return useQuery({
    queryKey: ['explore', 'previous', tag ?? 'all'],
    enabled,
    queryFn: async () => {
      let req = supabase.from('published_feed').select('*').eq('period', previousPeriod()).order('published_at', { ascending: false }).limit(20);
      if (tag) req = req.contains('tag_slugs', [tag]);
      return unwrap<ExploreItem[]>(await req);
    },
  });
}

/** 精選：本月至少 3 本書、有寫說明的策展裡最新的一檔；都沒有就用最新的 */
export function pickFeatured(items: ExploreItem[]) {
  return items.find((i) => i.book_count >= 3 && !!i.description?.trim()) ?? items[0];
}

export function useSystemTags() {
  return useQuery({
    queryKey: ['tags', 'system'],
    staleTime: 10 * 60_000,
    queryFn: async () =>
      unwrap<{ id: string; slug: string; name: string }[]>(
        await supabase.from('tags').select('id, slug, name').eq('kind', 'system').order('sort'),
      ),
  });
}

// ---------------------------------------------------------------------------
// 追蹤
// ---------------------------------------------------------------------------
export function useFollowIds() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['follow-ids', session?.user.id],
    enabled: !!session,
    queryFn: async () =>
      new Set(unwrap<{ bookstore_id: string }[]>(await supabase.from('follows').select('bookstore_id')).map((r) => r.bookstore_id)),
  });
}

export function useToggleFollow() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ bookstoreId, follow }: { bookstoreId: string; follow: boolean }) => {
      const uid = session?.user.id;
      if (!uid) throw new Error('sign in required');
      const res = follow
        ? await supabase.from('follows').upsert({ follower_id: uid, bookstore_id: bookstoreId }, { ignoreDuplicates: true })
        : await supabase.from('follows').delete().eq('follower_id', uid).eq('bookstore_id', bookstoreId);
      if (res.error) throw new Error(res.error.message);
      if (follow) track('store_followed', { store_id: bookstoreId });
    },
    // 按下就先變成「追蹤中」，失敗再還原
    onMutate: async ({ bookstoreId, follow }) => {
      const key = ['follow-ids', session?.user.id];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Set<string>>(key);
      const next = new Set(prev ?? []);
      if (follow) next.add(bookstoreId);
      else next.delete(bookstoreId);
      qc.setQueryData(key, next);
      return { prev, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['follow-ids'] });
      qc.invalidateQueries({ queryKey: ['follows'] });
      qc.invalidateQueries({ queryKey: ['explore'] });
      qc.invalidateQueries({ queryKey: ['store'] });
    },
  });
}

export type FollowedStore = PublicStore & {
  latest: { title: string; period: string; book_count: number; published_at: string | null } | null;
};

/** B1 追蹤的書店＋各自最近一檔已發布的策展 */
export function useFollowedStores() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['follows', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const rows = unwrap<{ bookstore_id: string; created_at: string }[]>(
        await supabase.from('follows').select('bookstore_id, created_at').order('created_at', { ascending: false }),
      );
      if (rows.length === 0) return [] as FollowedStore[];
      const ids = rows.map((r) => r.bookstore_id);
      const [stores, curations] = await Promise.all([
        supabase.from('public_bookstores').select('*').in('id', ids),
        supabase
          .from('curations')
          .select('bookstore_id, title, period, published_at, curation_items(count)')
          .in('bookstore_id', ids)
          .eq('status', 'published')
          .order('period', { ascending: false }),
      ]);
      const storeRows = unwrap<PublicStore[]>(stores);
      const curRows = unwrap<
        { bookstore_id: string; title: string; period: string; published_at: string | null; curation_items: { count: number }[] }[]
      >(curations);
      // 依追蹤時間排序；看不到的書店（暫停、封鎖）不會出現在 public_bookstores
      return ids
        .map((id) => storeRows.find((s) => s.id === id))
        .filter((s): s is PublicStore => !!s)
        .map((s) => {
          const c = curRows.find((r) => r.bookstore_id === s.id);
          return {
            ...s,
            latest: c ? { title: c.title, period: c.period, published_at: c.published_at, book_count: c.curation_items[0]?.count ?? 0 } : null,
          };
        });
    },
  });
}

// ---------------------------------------------------------------------------
// 收藏的書（B2）
// ---------------------------------------------------------------------------
export type SavedBook = {
  book_id: string;
  created_at: string;
  from_curation_id: string | null;
  from_bookstore_id: string | null;
  books: Book;
  curations: { title: string | null } | null;
  bookstores: { name: string; slug: string; color: StoreColor } | null;
  note: string | null;
  source_text: string | null;
  link?: string | null;
  is_public?: boolean;
};

/** 想讀清單上顯示的「在哪看到」：從策展收藏的自動帶入書店與策展 */
export function wantSource(b: SavedBook) {
  if (b.source_text) return b.source_text;
  if (b.bookstores) return `${b.bookstores.name}${b.curations?.title ? ` · ${b.curations.title}` : b.from_curation_id ? '' : tr(' · 店主正在讀')}`;
  if (b.from_bookstore_id || b.from_curation_id) return tr('來源書店目前看不到');
  return null;
}

export function useSaveIds() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['save-ids', session?.user.id],
    enabled: !!session,
    queryFn: async () =>
      new Set(unwrap<{ book_id: string }[]>(await supabase.from('book_saves').select('book_id')).map((r) => r.book_id)),
  });
}

export function useSavedBooks() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['saves', session?.user.id],
    enabled: !!session,
    queryFn: async () =>
      unwrap<SavedBook[]>(
        await supabase
          .from('book_saves')
          .select(`book_id, created_at, from_curation_id, from_bookstore_id, note, source_text, link, is_public, books(${BOOK_COLS}), curations(title), bookstores(name, slug, color)`)
          .order('created_at', { ascending: false }),
      ),
  });
}

export type SaveInput = { bookId: string; save: boolean; curationId?: string | null; bookstoreId?: string | null; note?: string | null; sourceText?: string | null };

export function useToggleSave() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ bookId, save, curationId, bookstoreId, note, sourceText }: SaveInput) => {
      const uid = session?.user.id;
      if (!uid) throw new Error('sign in required');
      const res = save
        ? await supabase.from('book_saves').upsert(
            { user_id: uid, book_id: bookId, from_curation_id: curationId ?? null, from_bookstore_id: bookstoreId ?? null, note: note ?? null, source_text: sourceText ?? null },
            { ignoreDuplicates: true },
          )
        : await supabase.from('book_saves').delete().eq('user_id', uid).eq('book_id', bookId);
      if (res.error) throw new Error(res.error.message);
      if (save) track('book_saved', { store_id: bookstoreId ?? null, curation_id: curationId ?? null });
    },
    onMutate: async ({ bookId, save }) => {
      const key = ['save-ids', session?.user.id];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Set<string>>(key);
      const next = new Set(prev ?? []);
      if (save) next.add(bookId);
      else next.delete(bookId);
      qc.setQueryData(key, next);
      return { prev, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['save-ids'] });
      qc.invalidateQueries({ queryKey: ['saves'] });
    },
  });
}

// ---------------------------------------------------------------------------
// A4／A5 店主閱讀（讀者唯讀；私人紀錄由 RLS 擋掉）
// ---------------------------------------------------------------------------
export type NoteKind = 'quote' | 'reflection' | 'thought';
export type ReadingNote = {
  id: string;
  body: string;
  created_at: string;
  kind: NoteKind;
  title: string | null;
  page_ref: string | null;
  photo_paths: string[];
};
export const NOTE_COLS = 'id, body, created_at, kind, title, page_ref, photo_paths';
export type PublicReading = {
  id: string;
  bookstore_id: string;
  status: 'reading' | 'finished';
  started_at: string;
  finished_at: string | null;
  updated_at: string;
  books: Book;
  reading_notes: ReadingNote[];
};

const READING_COLS = `id, bookstore_id, status, started_at, finished_at, updated_at, books(${BOOK_COLS}), reading_notes(${NOTE_COLS})`;

const sortNotes = (r: PublicReading): PublicReading => ({
  ...r,
  reading_notes: [...r.reading_notes].sort((a, b) => b.created_at.localeCompare(a.created_at)),
});

export function useStoreReadings(bookstoreId: string | undefined) {
  return useQuery({
    queryKey: ['readings', bookstoreId],
    enabled: !!bookstoreId,
    queryFn: async () =>
      unwrap<PublicReading[]>(
        await supabase.from('readings').select(READING_COLS).eq('bookstore_id', bookstoreId!).order('updated_at', { ascending: false }),
      ).map(sortNotes),
  });
}

export function useReading(id: string | undefined) {
  return useQuery({
    queryKey: ['reading', id],
    enabled: !!id,
    queryFn: async () => {
      const r = unwrap<PublicReading | null>(await supabase.from('readings').select(READING_COLS).eq('id', id!).maybeSingle());
      if (!r) return null;
      const store = unwrap<PublicStore | null>(
        await supabase.from('public_bookstores').select('*').eq('id', r.bookstore_id).maybeSingle(),
      );
      return { reading: sortNotes(r), store };
    },
  });
}

// ---------------------------------------------------------------------------
// 書籍視角：一本書被哪些書店策展、各自的推薦理由
// ---------------------------------------------------------------------------
export type Appearance = {
  book_id: string;
  kind: 'curation' | 'reading';
  curation_id: string | null;
  curation_title: string | null;
  period: string | null;
  bookstore_id: string;
  slug: string;
  store_name: string;
  owner_name: string;
  color: StoreColor;
  note: string | null;
  at: string | null;
};

export function useBook(id: string | undefined) {
  return useQuery({
    queryKey: ['book', id],
    enabled: !!id,
    queryFn: async () => {
      const [book, apps] = await Promise.all([
        supabase.from('books').select(BOOK_COLS).eq('id', id!).maybeSingle(),
        supabase.from('book_appearances').select('*').eq('book_id', id!).order('at', { ascending: false }).limit(50),
      ]);
      return { book: unwrap<Book | null>(book), appearances: unwrap<Appearance[]>(apps) };
    },
  });
}

// ---------------------------------------------------------------------------
// 想讀：理由、在哪看到、開始讀
// ---------------------------------------------------------------------------
export function useUpsertWant() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ bookId, note, sourceText, link, isPublic }: { bookId: string; note?: string | null; sourceText?: string | null; link?: string | null; isPublic?: boolean }) => {
      const res = await supabase.from('book_saves').upsert(
        {
          user_id: session!.user.id,
          book_id: bookId,
          note: note?.trim() || null,
          source_text: sourceText?.trim() || null,
          ...(link !== undefined ? { link: link?.trim() ? (/^https?:\/\//i.test(link.trim()) ? link.trim() : `https://${link.trim()}`).slice(0, 500) : null } : {}),
          ...(isPublic !== undefined ? { is_public: isPublic } : {}),
        },
        { onConflict: 'user_id,book_id' },
      );
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['save-ids'] });
      qc.invalidateQueries({ queryKey: ['saves'] });
      qc.invalidateQueries({ queryKey: ['store-journal'] });
    },
  });
}

export function useStartReading() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookId: string) =>
      unwrap<{ id: string }>(await supabase.rpc('start_reading_from_save', { p_book_id: bookId })),
    onSuccess: () => {
      for (const k of ['save-ids', 'saves', 'my-readings', 'readings']) qc.invalidateQueries({ queryKey: [k] });
    },
  });
}

// ---------------------------------------------------------------------------
// A2 v1.1：推薦／最新／熱門、追蹤中、月份、已逛過
// ---------------------------------------------------------------------------
export type ExploreSort = 'recommend' | 'latest' | 'popular';
export type ExploreRow = ExploreItem & { visited: boolean; is_following: boolean; score: number };

export function useExploreList(opts: { period: string | null; sort: ExploreSort; tag?: string; following: boolean; unvisitedOnly: boolean }) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['explore', 'list', opts, session?.user.id],
    enabled: !opts.following || !!session,
    queryFn: async () => {
      const visitorKey = await getVisitorKey();
      return unwrap<ExploreRow[]>(
        await supabase.rpc('explore_list', {
          p_period: opts.period,
          p_sort: opts.sort,
          p_tag: opts.tag ?? null,
          p_following: opts.following,
          p_visitor_key: visitorKey,
          p_unvisited_only: opts.unvisitedOnly,
        }),
      );
    },
  });
}

export function useExploreMonths() {
  return useQuery({
    queryKey: ['explore', 'months'],
    staleTime: 10 * 60_000,
    queryFn: async () => unwrap<{ period: string; curation_count: number }[]>(await supabase.rpc('explore_months')),
  });
}
