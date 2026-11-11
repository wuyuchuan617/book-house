/**
 * v1.5 閱讀處方簽：一個人說出狀況，大家各開一本書（每人每張一次、一本書）。
 * 讀取都走 rx_* 函式（匿名發起時不外洩是誰）；發起直接寫 prescriptions（RLS 只能寫自己的）。
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { StoreColor } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { userMessage } from '@/lib/errors';
import { tr } from '@/lib/i18n';
import { unwrap } from '@/lib/queries';
import type { ReportReason } from '@/lib/safety';
import { supabase } from '@/lib/supabase';

export const RX_TITLE_MAX = 60;
export const RX_BODY_MAX = 300;
export const RX_REASON_MIN = 10;
export const RX_REASON_MAX = 200;
export const RX_DURATIONS = [7, 14, 30] as const;
export type RxDuration = (typeof RX_DURATIONS)[number];

export const RX_TAGS = ['mood', 'work', 'relationship', 'beginner', 'gift', 'kids', 'travel'] as const;
export type RxTag = (typeof RX_TAGS)[number];
export function rxTagLabel(t: string) {
  switch (t) {
    case 'mood':
      return tr('心情');
    case 'work':
      return tr('工作');
    case 'relationship':
      return tr('關係');
    case 'beginner':
      return tr('入門');
    case 'gift':
      return tr('送禮');
    case 'kids':
      return tr('孩子');
    case 'travel':
      return tr('旅行');
    default:
      return t;
  }
}

export type RxAuthor = { name: string | null; slug: string | null; color: StoreColor | null; avatar_path: string | null };
type RxBook = { id: string; title: string; cover_url: string | null; authors?: string[] };

export type RxListItem = {
  id: string;
  title: string;
  tags: string[];
  created_at: string;
  closes_at: string;
  is_open: boolean;
  is_mine: boolean;
  author: RxAuthor;
  reply_count: number;
  my_replied: boolean;
  covers: RxBook[];
};

export type RxReason = { id: string; reason: string; created_at: string; is_mine: boolean; author: RxAuthor };
export type RxBookGroup = { book: RxBook & { authors: string[] }; count: number; owner_wants: boolean; reasons: RxReason[] };
export type RxDetail = {
  id: string;
  title: string;
  body: string | null;
  tags: string[];
  created_at: string;
  closes_at: string;
  closed_at: string | null;
  extended: boolean;
  anonymous: boolean;
  duration_days: number;
  is_open: boolean;
  is_mine: boolean;
  author: RxAuthor;
  my_reply: { id: string; reason: string; book: RxBook & { authors: string[] } } | null;
  reply_count: number;
  books: RxBookGroup[];
};

export type RxMineStarted = { id: string; title: string; is_open: boolean; closes_at: string; closed_at: string | null; anonymous: boolean; reply_count: number; new_count: number; wanted_count: number };
export type RxMineReplied = { id: string; title: string; is_open: boolean; closes_at: string; reply_count: number; my_book: RxBook; owner_wants: boolean };

export type RxFilter = 'latest' | 'unanswered' | 'popular';

export const authorName = (a: RxAuthor) => a.name ?? tr('一位讀者');

/** 還剩幾天（無條件進位）；已結案回傳 null */
export function daysLeft(closesAt: string, isOpen: boolean) {
  if (!isOpen) return null;
  return Math.max(1, Math.ceil((new Date(closesAt).getTime() - Date.now()) / 86400e3));
}

function invalidate(qc: QueryClient) {
  for (const k of ['rx-list', 'rx', 'rx-mine', 'store-journal']) qc.invalidateQueries({ queryKey: [k] });
}

export function useRxList(filter: RxFilter, tag: string | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['rx-list', session?.user.id ?? 'anon', filter, tag ?? null],
    queryFn: async () => unwrap<RxListItem[]>(await supabase.rpc('rx_list', { p_filter: filter, p_tag: tag ?? null, p_limit: 50 })),
  });
}

export function useRx(id: string | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['rx', id, session?.user.id ?? 'anon'],
    enabled: !!id,
    queryFn: async () => unwrap<RxDetail | null>(await supabase.rpc('rx_detail', { p_id: id })),
  });
}

export function useRxMine(kind: 'started' | 'replied') {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['rx-mine', session?.user.id, kind],
    enabled: !!session,
    queryFn: async () => unwrap<(RxMineStarted | RxMineReplied)[]>(await supabase.rpc('rx_mine', { p_kind: kind })),
  });
}

export function useCreateRx() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; body: string; tags: RxTag[]; anonymous: boolean; duration: RxDuration }) =>
      unwrap<{ id: string }>(
        await supabase
          .from('prescriptions')
          .insert({ title: input.title.trim(), body: input.body.trim() || null, tags: input.tags, anonymous: input.anonymous, duration_days: input.duration })
          .select('id')
          .single(),
      ),
    onSuccess: (_d, v) => {
      track('rx_created', { tags: v.tags.length, anonymous: v.anonymous, duration: v.duration, has_body: !!v.body.trim() });
      invalidate(qc);
    },
  });
}

export function useRxReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { rxId: string; bookId: string; reason: string; editing: boolean }) => {
      const res = await supabase.rpc('rx_reply', { p_id: input.rxId, p_book_id: input.bookId, p_reason: input.reason });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: (_d, v) => {
      track('rx_replied', { editing: v.editing });
      invalidate(qc);
    },
  });
}

export function useRxWithdraw() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (rxId: string) => {
      const res = await supabase.from('prescription_replies').delete().eq('prescription_id', rxId).eq('user_id', session!.user.id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useRxAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'close' | 'extend' | 'delete' }) => {
      const res =
        action === 'delete'
          ? await supabase.from('prescriptions').delete().eq('id', id)
          : await supabase.rpc(action === 'close' ? 'rx_close' : 'rx_extend', { p_id: id });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useRxReport() {
  return useMutation({
    mutationFn: async (input: { target: 'prescription' | 'prescription_reply'; id: string; reason: ReportReason }) => {
      const res = await supabase.rpc('rx_report', { p_target: input.target, p_id: input.id, p_reason: input.reason });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: (_d, v) => track('report_submitted', { reason: v.reason, target: v.target }),
  });
}

/** 把資料庫錯誤換成中文 */
export function rxError(message: string) {
  if (message.includes('too many open')) return tr('同時最多開放 3 張處方簽，先結案一張再發起。');
  if (message.includes('content not allowed')) return tr('內容含有不適合公開的字詞，請修改後再試。');
  if (message.includes('cannot reply to your own')) return tr('不能開處方給自己發起的處方簽。');
  if (message.includes('is closed')) return tr('這張處方簽已經結案了。');
  if (message.includes('cannot extend')) return tr('每張處方簽只能延長一次。');
  if (message.includes('already reported')) return tr('你已經檢舉過了，我們會盡快處理。');
  if (message.includes('prescription_replies_reason_check')) return tr('理由要 {min}–{max} 字。', { min: RX_REASON_MIN, max: RX_REASON_MAX });
  if (message.includes('prescriptions_title_check')) return tr('狀況要寫 1–{max} 字。', { max: RX_TITLE_MAX });
  return userMessage(message);
}
