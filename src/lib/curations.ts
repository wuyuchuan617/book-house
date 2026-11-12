import { tick } from '@/lib/haptics';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { userMessage } from '@/lib/errors';
import { useAuth } from '@/lib/auth';
import { unwrap } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { tr } from '@/lib/i18n';

export type CurationStatus = 'draft' | 'scheduled' | 'published';

export type Book = {
  id: string;
  source: 'google_books' | 'open_library' | 'manual' | 'ncl';
  title: string;
  authors: string[];
  cover_url: string | null;
  published_year: number | null;
  publisher?: string | null;
};

export type CurationItem = { id: string; note: string | null; position: number; books: Book };

export type Curation = {
  id: string;
  bookstore_id: string;
  period: string;
  title: string | null;
  description: string | null;
  status: CurationStatus;
  published_at: string | null;
  scheduled_for: string | null;
  updated_at: string;
  curation_items: CurationItem[];
  curation_tags: { tag_id: string }[];
};

export type MyCurationRow = {
  id: string;
  period: string;
  title: string | null;
  description: string | null;
  status: CurationStatus;
  published_at: string | null;
  updated_at: string;
  book_count: number;
  save_count: number;
  noted_count: number;
  /** 拜訪次數（同一人一天算一次） */
  visit_count: number;
  /** 預約中：上架時間 */
  scheduled_for: string | null;
};

export type Tag = { id: string; slug: string; name: string; kind: 'system' | 'custom'; sort: number };

export const TITLE_MAX = 24;
export const DESCRIPTION_MAX = 500;
export const NOTE_MAX = 120;

const BOOK_COLS = 'id, source, title, authors, cover_url, published_year, publisher';

/** 策展有任何變動後要更新的畫面 */
function invalidateCuration(qc: QueryClient, id?: string) {
  if (id) qc.invalidateQueries({ queryKey: ['curation', id] });
  qc.invalidateQueries({ queryKey: ['my-store'] });
  qc.invalidateQueries({ queryKey: ['my-curations'] });
  qc.invalidateQueries({ queryKey: ['explore'] });
  qc.invalidateQueries({ queryKey: ['store'] });
}

export const sortedItems = (c: Pick<Curation, 'curation_items'>) =>
  [...c.curation_items].sort((a, b) => a.position - b.position);

// ---------------------------------------------------------------------------
// 讀取
// ---------------------------------------------------------------------------
export function useCuration(id: string | undefined) {
  return useQuery({
    queryKey: ['curation', id],
    enabled: !!id,
    queryFn: async () =>
      unwrap<Curation | null>(
        await supabase
          .from('curations')
          .select(
            `id, bookstore_id, period, title, description, status, published_at, scheduled_for, updated_at,
             curation_items(id, note, position, books(${BOOK_COLS})), curation_tags(tag_id)`,
          )
          .eq('id', id!)
          .maybeSingle(),
      ),
  });
}

/** 「新增策展」的預設月份：最後一檔的下一個月（伺服器算） */
export function useSuggestedPeriod() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['my-curations', 'suggest', session?.user.id],
    enabled: !!session,
    queryFn: async () => unwrap<string>(await supabase.rpc('suggest_new_period')),
  });
}

/** 單一策展的拜訪、讀者數、收藏數（只有店主拿得到） */
export function useCurationStats(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['curation-stats', id],
    enabled: !!id && enabled,
    queryFn: async () =>
      unwrap<{ visit_count: number; visitor_count: number; save_count: number }[]>(await supabase.rpc('curation_stats', { p_curation_id: id! }))[0] ?? null,
  });
}

export function useMyCurations() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['my-curations', session?.user.id],
    enabled: !!session,
    queryFn: async () => unwrap<MyCurationRow[]>(await supabase.rpc('my_curations')),
  });
}

/** 系統標籤＋這檔已選的自訂標籤 */
export function useTags(selectedIds: string[]) {
  const key = [...selectedIds].sort().join(',');
  return useQuery({
    queryKey: ['tags', key],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const system = unwrap<Tag[]>(await supabase.from('tags').select('*').eq('kind', 'system').order('sort'));
      const missing = selectedIds.filter((id) => !system.some((t) => t.id === id));
      const custom = missing.length ? unwrap<Tag[]>(await supabase.from('tags').select('*').in('id', missing)) : [];
      return [...system, ...custom];
    },
  });
}

export function useDeleteImpact(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['curation-impact', id],
    enabled: !!id && enabled,
    queryFn: async () =>
      unwrap<{ book_count: number; save_count: number; status: CurationStatus } | null>(
        await supabase.rpc('curation_delete_impact', { p_curation_id: id! }).maybeSingle(),
      ),
  });
}

// ---------------------------------------------------------------------------
// 選書（S1）
// ---------------------------------------------------------------------------
export function useBookSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['book-search', q],
    enabled: [...q].length >= 2,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ books: Book[] }>('book-search', { body: { q } });
      if (error) throw new Error(error.message);
      return data?.books ?? [];
    },
  });
}

export function useCreateManualBook() {
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ title, author }: { title: string; author: string }) =>
      unwrap<Book>(
        await supabase
          .from('books')
          .insert({ source: 'manual', title: title.trim(), authors: [author.trim()], created_by: session?.user.id })
          .select(BOOK_COLS)
          .single(),
      ),
    onSuccess: () => track('book_manual_created', { has_author: true }),
  });
}

// ---------------------------------------------------------------------------
// 寫入
// ---------------------------------------------------------------------------
export function useCreateCuration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { period: string; title?: string; description?: string }) =>
      unwrap<{ id: string; period: string }>(
        await supabase.rpc('create_curation', {
          p_period: input.period,
          p_title: input.title ?? null,
          p_description: input.description ?? null,
        }),
      ),
    onSuccess: (c) => invalidateCuration(qc, c.id),
  });
}

export function useUpdateCuration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title, description }: { id: string; title?: string | null; description?: string | null }) => {
      const patch: Record<string, string | null> = {};
      if (title !== undefined) patch.title = title?.trim() || null;
      if (description !== undefined) patch.description = description?.trim() || null;
      const res = await supabase.from('curations').update(patch).eq('id', id);
      if (res.error) throw new Error(res.error.message);
      return id;
    },
    onSuccess: (id) => invalidateCuration(qc, id),
  });
}

export function useSetTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tagIds }: { id: string; tagIds: string[] }) => {
      const res = await supabase.rpc('set_curation_tags', { p_curation_id: id, p_tag_ids: tagIds });
      if (res.error) throw new Error(res.error.message);
      return id;
    },
    onSuccess: (id) => invalidateCuration(qc, id),
  });
}

export function useCreateCustomTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => unwrap<Tag>(await supabase.rpc('create_custom_tag', { p_name: name })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  });
}

export function useAddItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ curationId, bookId, note }: { curationId: string; bookId: string; note?: string | null }) =>
      unwrap<{ id: string }>(
        await supabase.rpc('add_curation_item', { p_curation_id: curationId, p_book_id: bookId, p_note: note ?? null }),
      ),
    onSuccess: (_d, v) => {
      track('book_added', { has_reason: !!v.note?.trim() });
      invalidateCuration(qc, v.curationId);
    },
  });
}

export function useUpdateItemNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, note }: { curationId: string; itemId: string; note: string | null }) => {
      const res = await supabase.from('curation_items').update({ note: note?.trim() || null }).eq('id', itemId);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: (_d, v) => invalidateCuration(qc, v.curationId),
  });
}

export function useRemoveItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId }: { curationId: string; itemId: string }) => {
      const res = await supabase.from('curation_items').delete().eq('id', itemId);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: (_d, v) => invalidateCuration(qc, v.curationId),
  });
}

export function useReorderItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ curationId, itemIds }: { curationId: string; itemIds: string[] }) => {
      const res = await supabase.rpc('reorder_curation_items', { p_curation_id: curationId, p_item_ids: itemIds });
      if (res.error) throw new Error(res.error.message);
    },
    // 先在畫面上換好順序，失敗再還原
    onMutate: async ({ curationId, itemIds }) => {
      await qc.cancelQueries({ queryKey: ['curation', curationId] });
      const prev = qc.getQueryData<Curation | null>(['curation', curationId]);
      if (prev) {
        qc.setQueryData<Curation>(['curation', curationId], {
          ...prev,
          curation_items: prev.curation_items.map((it) => ({ ...it, position: itemIds.indexOf(it.id) })),
        });
      }
      return { prev };
    },
    onError: (_e, v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['curation', v.curationId], ctx.prev);
    },
    onSettled: (_d, _e, v) => invalidateCuration(qc, v.curationId),
  });
}

/** 發布或預約：publishOn = 'YYYY-MM-DD'（台北時間早上 9 點上架；今天就立刻上架） */
export function usePublishCuration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, publishOn }: { id: string; publishOn?: string }) =>
      unwrap<{ id: string; status: CurationStatus; period: string; scheduled_for: string | null }>(
        await supabase.rpc('publish_curation', { p_curation_id: id, p_publish_on: publishOn ?? null }),
      ),
    onSuccess: (c) => {
      tick();
      track('curation_published', { month: c.period?.slice(0, 7), scheduled: c.status === 'scheduled' });
      invalidateCuration(qc, c.id);
    },
  });
}

export function useUnpublishCuration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap<{ id: string }>(await supabase.rpc('unpublish_curation', { p_curation_id: id })),
    onSuccess: (c) => invalidateCuration(qc, c.id),
  });
}

export function useDuplicateCuration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, period }: { id: string; period?: string }) =>
      unwrap<{ id: string; period: string }>(
        await supabase.rpc('duplicate_curation', { p_curation_id: id, p_period: period ?? null }),
      ),
    onSuccess: (c) => invalidateCuration(qc, c.id),
  });
}

export function useDeleteCuration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase.from('curations').delete().eq('id', id);
      if (res.error) throw new Error(res.error.message);
      return id;
    },
    onSuccess: (id) => {
      qc.removeQueries({ queryKey: ['curation', id] });
      invalidateCuration(qc);
    },
  });
}

/** 把伺服器錯誤換成給店主看的中文 */
export function friendlyError(message: string) {
  if (message.includes('title is required')) return tr('先取一個策展標題才能發布。');
  if (message.includes('every book needs a note')) return tr('每本書都要寫推薦理由才能發布。');
  if (message.includes('cannot clear a note')) return tr('發布中的策展不能把推薦理由清空。');
  if (message.includes('at least 1 book to publish')) return tr('書架上至少要有 1 本書才能發布。');
  if (message.includes('already has a published')) return tr('這個月已經有一檔發布中的策展了。');
  if (message.includes('needs at least 1 book')) return tr('發布中的策展至少要留 1 本書。想清空書架請先取消發布。');
  if (message.includes('at most 3 tags')) return tr('主題標籤最多 3 個。');
  if (message.includes('at most 20 books')) return tr('一檔策展最多放 20 本書。');
  if (message.includes('only this month or next month') || message.includes('next 3 months')) return tr('策展只能排在本月起 4 個月內。');
  if (message.includes('publish date must be in')) return tr('上架日期要在這檔策展的月份裡。');
  if (message.includes('publish date is in the past')) return tr('上架日期不能早於今天。');
  if (message.includes('tag name must be')) return tr('標籤名稱 1–12 個字。');
  return userMessage(message);
}
