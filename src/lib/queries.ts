import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { StoreColor } from '@/constants/theme';
import type { Book } from '@/lib/curations';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/** 型別先手寫最小集合；之後以 `npm run db:types` 產生完整 Database 型別取代 */
export type ExploreItem = {
  curation_id: string;
  title: string;
  description: string | null;
  period: string;
  bookstore_id: string;
  slug: string;
  store_name: string;
  owner_name: string;
  color: StoreColor;
  avatar_path: string | null;
  follower_count: number;
  book_count: number;
  cover_urls: (string | null)[];
  tag_slugs: string[];
};

export type PublicStore = {
  id: string;
  slug: string;
  name: string;
  owner_name: string;
  tagline: string | null;
  color: StoreColor;
  avatar_path: string | null;
  banner_path: string | null;
  follower_count: number;
};

export type MyStore = Omit<PublicStore, 'follower_count'> & { status: 'active' | 'paused' | 'deleted' };

/** 失敗就丟出錯誤；成功回傳 data。T 由呼叫端指定（型別產生前的暫時做法） */
export function unwrap<T>({ data, error }: { data: unknown; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export function useExploreFeed(tag?: string) {
  return useQuery({
    queryKey: ['explore', tag ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('explore_feed').select('*').order('published_at', { ascending: false }).limit(50);
      if (tag) q = q.contains('tag_slugs', [tag]);
      return unwrap<ExploreItem[]>(await q);
    },
  });
}

export function usePublicStore(slug: string) {
  return useQuery({
    queryKey: ['store', slug],
    queryFn: async () => {
      const store = unwrap<PublicStore | null>(
        await supabase.from('public_bookstores').select('*').eq('slug', slug).maybeSingle(),
      );
      if (!store) return null;
      const curations = unwrap<
        { id: string; period: string; title: string; description: string | null;
          curation_items: { id: string; note: string | null; position: number;
            books: Book }[] }[]
      >(
        await supabase
          .from('curations')
          .select('id, period, title, description, curation_items(id, note, position, books(id, source, title, authors, cover_url, published_year))')
          .eq('bookstore_id', store.id)
          .eq('status', 'published')
          .order('period', { ascending: false }),
      );
      return { store, curations };
    },
  });
}

export function useMyStore() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['my-store', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const store = unwrap<MyStore | null>(
        await supabase.from('bookstores').select('*').eq('owner_id', session!.user.id).maybeSingle(),
      );
      if (!store) return null;
      const [stats, curations] = await Promise.all([
        supabase.rpc('my_store_stats').maybeSingle(),
        supabase.from('curations').select('id, period, title, status, published_at').eq('bookstore_id', store.id).order('period', { ascending: false }),
      ]);
      return {
        store,
        stats: unwrap(stats) as { follower_count: number; visits_this_month: number; published_curation_count: number } | null,
        curations: unwrap(curations) as { id: string; period: string; title: string | null; status: 'draft' | 'scheduled' | 'published' }[],
      };
    },
  });
}

export function useFollowedStores() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['follows', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const rows = unwrap<{ bookstore_id: string }[]>(await supabase.from('follows').select('bookstore_id'));
      if (rows.length === 0) return [] as PublicStore[];
      return unwrap<PublicStore[]>(
        await supabase.from('public_bookstores').select('*').in('id', rows.map((r) => r.bookstore_id)),
      );
    },
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
        ? await supabase.from('follows').insert({ follower_id: uid, bookstore_id: bookstoreId })
        : await supabase.from('follows').delete().eq('follower_id', uid).eq('bookstore_id', bookstoreId);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follows'] });
      qc.invalidateQueries({ queryKey: ['explore'] });
      qc.invalidateQueries({ queryKey: ['store'] });
    },
  });
}

export function useCreateBookstore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; ownerName: string; color: StoreColor }) =>
      unwrap(
        await supabase.rpc('create_bookstore', { p_name: input.name, p_owner_name: input.ownerName, p_color: input.color }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-store'] }),
  });
}

const VISITOR_KEY = 'bookhaus.visitor-key';

/** 訪客的匿名裝置代號（隨機產生、只存在本機；需寫進隱私權政策） */
async function getVisitorKey() {
  try {
    const existing = await AsyncStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const key = `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    await AsyncStorage.setItem(VISITOR_KEY, key);
    return key;
  } catch {
    return null;
  }
}

/** 讀者看到某檔策展時呼叫一次；伺服器端已做「同一人同一天」去重，登入者以 user id 計 */
export async function recordVisit(curationId: string) {
  const visitorKey = await getVisitorKey();
  await supabase.rpc('record_visit', { p_curation_id: curationId, p_visitor_key: visitorKey });
}
