/** M5 安全：A6–A8 檢舉／封鎖、設定 › 已封鎖的帳號 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { userMessage } from '@/lib/errors';
import { useAuth } from '@/lib/auth';
import { unwrap } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { tr } from '@/lib/i18n';

export type ReportReason = 'inappropriate' | 'infringement' | 'spam' | 'impersonation' | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string; sub?: string }[] = [
  { value: 'inappropriate', get label() { return tr('不當或冒犯性內容'); } },
  { value: 'infringement', get label() { return tr('侵權或盜版'); }, get sub() { return tr('例如整本書內容、未授權圖片'); } },
  { value: 'spam', get label() { return tr('垃圾訊息或廣告'); } },
  { value: 'impersonation', get label() { return tr('冒充他人'); } },
  { value: 'other', get label() { return tr('其他'); } },
];

/** 封鎖／解除封鎖後，所有看得到書店的畫面都要重新整理 */
function refreshVisibility(qc: QueryClient) {
  for (const key of ['explore', 'store', 'follows', 'follow-ids', 'saves', 'readings', 'reading', 'book', 'blocked']) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

export function useBlockStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookstoreId: string) => {
      const res = await supabase.rpc('block_bookstore', { p_bookstore_id: bookstoreId });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => refreshVisibility(qc),
  });
}

export function useReportStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bookstoreId: string; reason: ReportReason; detail?: string; alsoBlock: boolean }) => {
      const res = await supabase.rpc('report_bookstore', {
        p_bookstore_id: input.bookstoreId,
        p_reason: input.reason,
        p_detail: input.detail?.trim() || null,
        p_also_block: input.alsoBlock,
      });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: (_d, v) => {
      track('report_submitted', { reason: v.reason, also_blocked: v.alsoBlock });
      if (v.alsoBlock) refreshVisibility(qc);
    },
  });
}

export type BlockedAccount = { blocked_id: string; display_name: string; store_name: string | null; blocked_at: string };

export function useBlockedAccounts() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['blocked', session?.user.id],
    enabled: !!session,
    queryFn: async () => unwrap<BlockedAccount[]>(await supabase.rpc('my_blocked_accounts')),
  });
}

export function useUnblock() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (blockedId: string) => {
      const res = await supabase.from('blocks').delete().eq('blocker_id', session!.user.id).eq('blocked_id', blockedId);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => refreshVisibility(qc),
  });
}

export function safetyError(message: string) {
  if (message.includes('already reported')) return tr('你在 24 小時內已經檢舉過這間書店，我們正在審核。');
  if (message.includes('cannot block yourself')) return tr('不能封鎖自己。');
  if (message.includes('not found')) return tr('找不到這間書店，它可能已經關閉。');
  return userMessage(message);
}
