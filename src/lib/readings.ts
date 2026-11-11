/** M4 店主閱讀（R1–R7、O8）與書店設定（M2 編輯書店、M9 刪除書店） */
import { Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { StoreColor } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { userMessage } from '@/lib/errors';
import { useAuth } from '@/lib/auth';
import { NOTE_COLS, type NoteKind, type PublicReading } from '@/lib/browse';
import type { Book } from '@/lib/curations';
import { unwrap, useMyStore, type StoreShow } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { tr } from '@/lib/i18n';

const BOOK_COLS = 'id, source, title, authors, cover_url, published_year, publisher';

export type MyReading = PublicReading & { is_public: boolean; created_at: string };
export type ReadingStatus = 'reading' | 'finished';

const MY_READING_COLS = `id, bookstore_id, status, is_public, started_at, finished_at, created_at, updated_at, books(${BOOK_COLS}), reading_notes(${NOTE_COLS}, from_scan, updated_at)`;

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
export const NOTE_TITLE_MAX = 40;
export const NOTE_PAGE_MAX = 20;
export const NOTE_PHOTO_MAX = 3;
/** 公開的摘句建議只節錄一小段 */
export const QUOTE_SOFT_MAX = 300;
const NOTE_BUCKET = 'note-images';

/** 心得的圖片：已上傳的路徑，或剛選的本機檔案 */
export type NotePhoto = { path: string } | { uri: string; mimeType?: string | null };

export type NoteInput = {
  kind: NoteKind;
  title?: string | null;
  body: string;
  pageRef?: string | null;
  photos: NotePhoto[];
  fromScan?: boolean;
};

async function uploadNotePhotos(storeId: string, noteId: string, photos: NotePhoto[]) {
  const paths: string[] = [];
  for (const [i, p] of photos.entries()) {
    if ('path' in p) {
      paths.push(p.path);
      continue;
    }
    const type = p.mimeType && ['image/jpeg', 'image/png', 'image/webp'].includes(p.mimeType) ? p.mimeType : 'image/jpeg';
    const body = await (await fetch(p.uri)).arrayBuffer();
    if (body.byteLength > 5 * 1024 * 1024) throw new Error(tr('圖片超過 5MB，請選一張小一點的。'));
    const path = `${storeId}/${noteId}/${Date.now()}-${i}.${type.split('/')[1].replace('jpeg', 'jpg')}`;
    const { error } = await supabase.storage.from(NOTE_BUCKET).upload(path, body, { contentType: type, upsert: false });
    if (error) throw new Error(tr('上傳沒有成功：{message}', { message: error.message }));
    paths.push(path);
  }
  return paths;
}

const clean = (v: string | null | undefined) => (v ?? '').trim() || null;

export function useSaveNote() {
  const qc = useQueryClient();
  const { data: store } = useMyStore();
  return useMutation({
    mutationFn: async ({ readingId, noteId, input, previousPaths = [] }: { readingId: string; noteId?: string; input: NoteInput; previousPaths?: string[] }) => {
      const storeId = store?.store.id;
      if (!storeId) throw new Error('open a bookstore first');
      const fields = {
        kind: input.kind,
        title: clean(input.title),
        body: input.body.trim(),
        page_ref: clean(input.pageRef),
        ...(noteId ? {} : { from_scan: !!input.fromScan }),
      };
      let id = noteId;
      if (id) {
        const res = await supabase.from('reading_notes').update(fields).eq('id', id);
        if (res.error) throw new Error(res.error.message);
      } else {
        id = unwrap<{ id: string }>(await supabase.from('reading_notes').insert({ reading_id: readingId, ...fields }).select('id').single()).id;
      }
      const paths = await uploadNotePhotos(storeId, id, input.photos);
      const removed = previousPaths.filter((p) => !paths.includes(p));
      if (paths.join('|') !== previousPaths.join('|')) {
        const res = await supabase.from('reading_notes').update({ photo_paths: paths }).eq('id', id);
        if (res.error) throw new Error(res.error.message);
      }
      if (removed.length) await supabase.storage.from(NOTE_BUCKET).remove(removed).then(() => {}, () => {});
      return { id, isNew: !noteId };
    },
    onSuccess: (r, v) => {
      if (r.isNew) {
        track('reading_note_added', {
          length: v.input.body.trim().length,
          kind: v.input.kind,
          has_title: !!clean(v.input.title),
          photo_count: v.input.photos.length,
          from_scan: !!v.input.fromScan,
        });
      }
      invalidateReadings(qc);
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, photoPaths = [], withPost = false }: { id: string; photoPaths?: string[]; withPost?: boolean }) => {
      // v1.7 Y8：舊資料「也存成心得」的日記貼文連著這則心得；選了一起刪就先刪貼文
      if (withPost) {
        const posts = await supabase.from('diary_entries').select('id, photo_paths').eq('reading_note_id', id);
        for (const p of (posts.data ?? []) as { id: string; photo_paths: string[] }[]) {
          await supabase.from('diary_entries').delete().eq('id', p.id);
          if (p.photo_paths.length) await supabase.storage.from('diary').remove(p.photo_paths).then(() => {}, () => {});
        }
      }
      const res = await supabase.from('reading_notes').delete().eq('id', id);
      if (res.error) throw new Error(res.error.message);
      if (photoPaths.length) await supabase.storage.from(NOTE_BUCKET).remove(photoPaths).then(() => {}, () => {});
    },
    onSuccess: () => {
      invalidateReadings(qc);
      qc.invalidateQueries({ queryKey: ['diary'] });
      qc.invalidateQueries({ queryKey: ['store-journal'] });
    },
  });
}

/** v1.7 Y8：刪心得前確認；連著日記貼文時問「只刪心得／一起刪」 */
export async function confirmDeleteNote(noteId: string, onDelete: (withPost: boolean) => void) {
  const linked = await hasLinkedPost(noteId).catch(() => false);
  if (!linked) {
    Alert.alert(tr('刪除這則心得？'), tr('刪除後無法復原。'), [
      { text: tr('取消'), style: 'cancel' },
      { text: tr('刪除'), style: 'destructive', onPress: () => onDelete(false) },
    ]);
    return;
  }
  Alert.alert(tr('刪除這則心得？'), tr('這則心得當天也存成了一則日記貼文。'), [
    { text: tr('取消'), style: 'cancel' },
    { text: tr('只刪心得'), style: 'destructive', onPress: () => onDelete(false) },
    { text: tr('心得和貼文一起刪'), style: 'destructive', onPress: () => onDelete(true) },
  ]);
}

/** 這則心得有沒有連著一則日記貼文（v1.6 以前「也存成心得」留下的） */
export async function hasLinkedPost(noteId: string) {
  const res = await supabase.from('diary_entries').select('id', { count: 'exact', head: true }).eq('reading_note_id', noteId);
  return (res.count ?? 0) > 0;
}

/** 心得圖片（非公開 bucket）→ 1 小時有效的網址；看不到的會是 null */
export function useNoteImageUrls(paths: string[] | undefined) {
  const key = (paths ?? []).join('|');
  return useQuery({
    queryKey: ['note-images', key],
    enabled: !!key,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(NOTE_BUCKET).createSignedUrls(key.split('|'), 3600);
      if (error) throw new Error(error.message);
      return (data ?? []).map((d) => d.signedUrl ?? null);
    },
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
    mutationFn: async (patch: Partial<{ name: string; owner_name: string; tagline: string | null; slug: string; color: StoreColor; reading_public_default: boolean; setup_done: boolean } & StoreShow>) => {
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
  if (message.includes('bookstores_slug_key') || message.includes('duplicate key')) return tr('這個網址已經有人用了，換一個試試。');
  if (message.includes('reserved')) return tr('這個網址是保留字，換一個試試。');
  if (message.includes('slug_check')) return tr('網址只能用小寫英文、數字和「-」，3–30 個字。');
  if (message.includes('reading_notes_body_check')) return tr('心得 1–1000 字。');
  return userMessage(message);
}
