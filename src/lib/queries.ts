import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { StoreColor } from '@/constants/theme';
import type { Book } from '@/lib/curations';
import { track } from '@/lib/analytics';
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
  cover_titles: string[];
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
} & Partial<StoreShow>;

/** 公開設定：書店頁顯示哪幾類（一類關掉 → 書店頁整類看不到） */
export type StoreShow = { show_reading: boolean; show_want: boolean; show_place: boolean; show_post: boolean; show_rx: boolean; show_owned?: boolean; show_trip?: boolean };

export type MyStore = Omit<PublicStore, 'follower_count'> &
  StoreShow & { status: 'active' | 'paused' | 'deleted'; reading_public_default: boolean; auto_created: boolean; setup_done: boolean };

/** 失敗就丟出錯誤；成功回傳 data。T 由呼叫端指定（型別產生前的暫時做法） */
export function unwrap<T>({ data, error }: { data: unknown; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
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
      let store = unwrap<MyStore | null>(
        await supabase.from('bookstores').select('*').eq('owner_id', session!.user.id).maybeSingle(),
      );
      // 每個人都有書店：還沒有（舊帳號、重設書店後）就幫他開一間
      if (!store) store = unwrap<MyStore | null>(await supabase.rpc('ensure_my_bookstore').maybeSingle());
      if (!store?.id) return null;
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

export function useCreateBookstore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; ownerName: string; color: StoreColor }) =>
      unwrap(
        await supabase.rpc('create_bookstore', { p_name: input.name, p_owner_name: input.ownerName, p_color: input.color }),
      ),
    onSuccess: (_d, v) => {
      track('store_created', { color: v.color });
      qc.invalidateQueries({ queryKey: ['my-store'] });
    },
  });
}

const VISITOR_KEY = 'bookhaus.visitor-key';

/** 訪客的匿名裝置代號（隨機產生、只存在本機；需寫進隱私權政策） */
export async function getVisitorKey() {
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
