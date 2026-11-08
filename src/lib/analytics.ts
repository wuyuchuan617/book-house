/**
 * P2 埋點：寫進 Supabase `events` 表（只能新增、不能讀）。不用第三方分析工具，之後要換工具只改這個檔。
 * 開發模式預設不送，避免測試資料混進來；要測試時設 EXPO_PUBLIC_TRACK_DEV=1。
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getVisitorKey } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

export type EventName =
  | 'login_success'
  | 'login_gate_shown'
  | 'store_created'
  | 'onboarding_step_skipped'
  | 'curation_published'
  | 'book_added'
  | 'book_manual_created'
  | 'store_followed'
  | 'book_saved'
  | 'reading_logged'
  | 'reading_note_added'
  | 'share_link_copied'
  | 'report_submitted'
  | 'account_delete_requested'
  | 'page_scanned'
  | 'diary_entry_created'
  | 'diary_opened'
  | 'place_saved'
  | 'place_opened'
  | 'place_maps_opened'
  | 'weekly_review_opened'
  | 'weekly_reflection_saved'
  | 'weekly_review_shared';

type Props = Record<string, string | number | boolean | null | undefined>;

const enabled = !__DEV__ || process.env.EXPO_PUBLIC_TRACK_DEV === '1';

export function track(name: EventName, props: Props = {}) {
  if (!enabled) return;
  void (async () => {
    try {
      const [{ data }, anonId] = await Promise.all([supabase.auth.getSession(), getVisitorKey()]);
      await supabase.from('events').insert({
        name,
        props,
        user_id: data.session?.user.id ?? null,
        anon_id: anonId,
        platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
        app_version: Constants.expoConfig?.version ?? null,
      });
    } catch {
      // 埋點失敗不影響使用
    }
  })();
}
