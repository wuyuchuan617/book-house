/** 設定 › 通知、M5 每月策展提醒 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { unwrap } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

export type NotificationPrefs = {
  new_curation_from_followed: boolean;
  new_follower: boolean;
  monthly_reminder: boolean;
  reminder_day: 20 | 25 | -3 | null;
  weekly_review: boolean;
  /** v1.5 閱讀處方簽（伺服器還沒更新時沒有這欄） */
  prescription?: boolean;
};

export function useNotificationPrefs() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['prefs', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const cols = 'new_curation_from_followed, new_follower, monthly_reminder, reminder_day, weekly_review';
      const res = await supabase.from('notification_prefs').select(`${cols}, prescription`).maybeSingle();
      if (res.error && /prescription/i.test(res.error.message)) return unwrap<NotificationPrefs | null>(await supabase.from('notification_prefs').select(cols).maybeSingle());
      return unwrap<NotificationPrefs | null>(res);
    },
  });
}

export function useUpdatePrefs() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const key = ['prefs', session?.user.id];
  return useMutation({
    mutationFn: async (patch: Partial<NotificationPrefs>) => {
      const res = await supabase.from('notification_prefs').update(patch).eq('user_id', session!.user.id);
      if (res.error) throw new Error(res.error.message);
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationPrefs>(key);
      if (prev) qc.setQueryData(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
