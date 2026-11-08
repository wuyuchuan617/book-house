/** M4 店主閱讀（R1–R7、O8）與書店設定（M2 編輯書店、M9 刪除書店） */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { StoreColor } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { userMessage } from '@/lib/errors';
import { useAuth } from '@/lib/auth';
import type { PublicReading } from '@/lib/browse';
import type { Book } from '@/lib/curations';
import { unwrap, useMyStore } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

const BOOK_COLS = 'id, source, title, authors, cover_url, published_year, publisher';

export type MyReading = PublicReading & { is_public: boolean; created_at: string };
export type ReadingStatus = 'reading' | 'finished';

const MY_READING_COLS = `id, bookstore_id, status, is_public, started_at, finished_at, created_at, updated_at, books(${BOOK_COLS}), reading_notes(id, body, created_at)`;

const sortNotes = <T extends PublicReading>(r: T): T => ({
  ...r,
  reading_notes: [...r.reading_notes].sort((a, b) => b.created_at.localeCompare(a.created_at)),
});

function invalidateReadings(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['my-readings'] });
  qc.invalidateQueries({ queryKey: ['my-reading'] });
  qc.invalidateQueries({ queryKey: ['readings'] });
  qc.invalidateQueries({ queryKey: ['reading'] });
}

// ---------------------------------------------------------------------------
// 讀取（店主看得到私人紀錄）
// ---------------------------------------------------------------------------
export function useMyReadings() {
  const { data: store } = useMyStore();
  const storeId = store?.store.id;
  return useQuery({
    queryKey: ['my-readings', storeId],
    enabled: !!storeId,
    queryFn: async () =>
      unwrap<MyReading[]>(
        await supabase.from('readings').select(MY_READING_COLS).eq('bookstore_id', storeId!).order('updated_at', { ascending: false }),
      ).map(sortNotes),
  });
}

export function useMyReading(id: string | undefined) {
  return useQuery({
    queryKey: ['my-reading', id],
    enabled: !!id,
    queryFn: async () => {
      const r = unwrap<MyReading | null>(await supabase.from('readings').select(MY_READING_COLS).eq('id', id!).maybeSingle());
      return r ? sortNotes(r) : null;
    },
  });
}

/** R3「最近在你的策展裡」：選書時的快速選項 */
export function useMyCurationBooks() {
  const { data: store } = useMyStore();
  const storeId = store?.store.id;
  return useQuery({
    queryKey: ['my-curation-books', storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const rows = unwrap<{ curation_items: { books: Book }[] }[]>(
        await supabase
          .from('curations')
          .select(`curation_items(books(${BOOK_COLS}))`)
          .eq('bookstore_id', storeId!)
          .order('period', { ascending: false })
          .limit(3),
      );
      const seen = new Set<string>();
      return rows
        .flatMap((r) => r.curation_items.map((i) => i.books))
        .filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)))
        .slice(0, 6);
    },
  });
}

// ---------------------------------------------------------------------------
// 寫入
// ---------------------------------------------------------------------------
export function useAddReading() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bookId: string; status: ReadingStatus; isPublic: boolean; note?: string }) =>
      unwrap<{ id: string }>(
        await supabase.rpc('add_reading', {
          p_book_id: input.bookId,
          p_status: input.status,
          p_is_public: input.isPublic,
          p_note: input.note?.trim() || null,
        }),
      ),
    onSuccess: (_d, v) => {
      track('reading_logged', { status: v.status, has_note: !!v.note?.trim(), public: v.isPublic });
      invalidateReadings(qc);
    },
  });
}

export function useUpdateReading() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; status?: ReadingStatus; is_public?: boolean }) => {
      const res = await supabase.from('readings').update(patch).eq('id', id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => invalidateReadings(qc),
  });
}

export function useDeleteReading() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase.from('readings').delete().eq('id', id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => invalidateReadings(qc),
  });
}

export const NOTE_BODY_MAX = 1000;

export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ readingId, body }: { readingId: string; body: string }) => {
      const res = await supabase.from('reading_notes').insert({ reading_id: readingId, body: body.trim() });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: (_d, v) => {
      track('reading_note_added', { length: v.body.trim().length });
      invalidateReadings(qc);
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const res = await supabase.from('reading_notes').update({ body: body.trim() }).eq('id', id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => invalidateReadings(qc),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase.from('reading_notes').delete().eq('id', id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => invalidateReadings(qc),
  });
}

// ---------------------------------------------------------------------------
// M2 編輯書店、M9 刪除書店、店主閱讀預設公開
// ---------------------------------------------------------------------------
export function useSlugAvailability(slug: string, current: string | undefined) {
  const s = slug.trim().toLowerCase();
  return useQuery({
    queryKey: ['slug', s],
    enabled: s.length >= 3 && s !== current,
    staleTime: 30_000,
    queryFn: async () =>
      unwrap<{ available: boolean; suggestions: string[] } | null>(
        await supabase.rpc('is_slug_available', { p_slug: s }).maybeSingle(),
      ),
  });
}

export const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{1,28})[a-z0-9]$/;

export function useUpdateStore() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (patch: Partial<{ name: string; owner_name: string; tagline: string | null; slug: string; color: StoreColor; reading_public_default: boolean }>) => {
      const res = await supabase.from('bookstores').update(patch).eq('owner_id', session!.user.id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-store'] });
      qc.invalidateQueries({ queryKey: ['store'] });
      qc.invalidateQueries({ queryKey: ['explore'] });
    },
  });
}

export function useStoreDeleteImpact(enabled: boolean) {
  return useQuery({
    queryKey: ['store-impact'],
    enabled,
    queryFn: async () =>
      unwrap<{ curation_count: number; reading_count: number; follower_count: number; slug: string } | null>(
        await supabase.rpc('store_delete_impact').maybeSingle(),
      ),
  });
}

export function useDeleteStore() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const res = await supabase.from('bookstores').delete().eq('owner_id', session!.user.id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** 把 Supabase 錯誤換成給店主看的中文 */
export function readingError(message: string) {
  if (message.includes('bookstores_slug_key') || message.includes('duplicate key')) return '這個網址已經有人用了，換一個試試。';
  if (message.includes('reserved')) return '這個網址是保留字，換一個試試。';
  if (message.includes('slug_check')) return '網址只能用小寫英文、數字和「-」，3–30 個字。';
  if (message.includes('reading_notes_body_check')) return '心得 1–1000 字。';
  return userMessage(message);
}
