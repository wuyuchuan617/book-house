/**
 * v1.7 積讀與購書紀錄：想讀 → 買了（積讀）→ 正在讀 → 讀完。
 * 金額只有自己看得到；伺服器還沒套用 v1.7 時，列表回空的。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { tr } from '@/lib/i18n';
import { unwrap } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

export type PurchaseFormat = 'paper' | 'ebook' | 'used' | 'borrowed';
export type PurchaseStatus = 'unread' | 'reading' | 'done' | 'gone';

export const FORMAT_LABEL = (): Record<PurchaseFormat, string> => ({ paper: tr('紙本'), ebook: tr('電子書'), used: tr('二手'), borrowed: tr('借來的') });

export type Purchase = {
  id: string;
  book_id: string;
  bought_on: string;
  place_id: string | null;
  place_name: string | null;
  store_label: string | null;
  price: number | null;
  format: PurchaseFormat;
  note: string | null;
  status: PurchaseStatus;
  book: { id: string; title: string; authors: string[]; cover_url: string | null };
};

export type MyPurchases = {
  items: Purchase[];
  this_year: number;
  unread: number;
  spent_this_year: number;
  by_month: { month: string; n: number }[];
  top_places: { name: string; n: number }[];
};

const EMPTY: MyPurchases = { items: [], this_year: 0, unread: 0, spent_this_year: 0, by_month: [], top_places: [] };

export function useMyPurchases() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['purchases', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const res = await supabase.rpc('my_purchases');
      if (res.error && /function|does not exist|schema cache/i.test(res.error.message)) return EMPTY;
      return unwrap<MyPurchases>(res);
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ['purchases', 'saves', 'save-ids', 'my-readings', 'readings', 'store-journal', 'book-mentions']) qc.invalidateQueries({ queryKey: [k] });
}

export function useRecordPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { bookId: string; boughtOn?: string; placeId?: string | null; storeLabel?: string | null; price?: number | null; format: PurchaseFormat; note?: string; start?: boolean }) =>
      unwrap<{ id: string }>(
        await supabase.rpc('record_purchase', {
          p_book_id: v.bookId,
          p_bought_on: v.boughtOn ?? null,
          p_place_id: v.placeId ?? null,
          p_store_label: v.storeLabel?.trim() || null,
          p_price: v.price ?? null,
          p_format: v.format,
          p_note: v.note?.trim() || null,
          p_start: !!v.start,
        }),
      ),
    onSuccess: (_d, v) => {
      track('book_purchased', { has_place: !!v.placeId, has_price: v.price != null, format: v.format, start: !!v.start });
      invalidate(qc);
    },
  });
}

export function useSetPurchaseStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PurchaseStatus }) => {
      const res = await supabase.from('book_purchases').update({ status }).eq('id', id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeletePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase.from('book_purchases').delete().eq('id', id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => invalidate(qc),
  });
}

/** 等了幾天（今天買的＝0） */
export function waitedDays(boughtOn: string) {
  const d = new Date(`${boughtOn}T00:00:00+08:00`).getTime();
  return Math.max(0, Math.floor((Date.now() - d) / 86400000));
}
