import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Screen } from '@/components/ui';
import { MinTouch, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMyStore } from '@/lib/queries';
import { useUpdateStore } from '@/lib/readings';
import { useBlockedAccounts } from '@/lib/safety';
import { useIsAdmin } from '@/lib/admin';
import { setAppearance, useAppearancePref } from '@/lib/appearance';
import { useAuth } from '@/lib/auth';
import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';
import { shareStore, storeLinkLabel } from '@/lib/links';
import { useNotificationPrefs, useUpdatePrefs, type NotificationPrefs } from '@/lib/notification-prefs';
import { Chip, Toggle } from '@/components/form';
import { userMessage } from '@/lib/errors';
import { currentLang, setLanguage, tr, useLanguagePref, type LangPref } from '@/lib/i18n';

/** M3 設定：書店、通知（含 M5 每月策展提醒）、已封鎖的帳號、說明與意見回饋、條款。外觀、語言。TODO(V2)：暫停營業 */
export default function SettingsScreen() {
  const { signOut } = useAuth();
  const c = useTheme();
  const { data: mine } = useMyStore();
  const updateStore = useUpdateStore();
  const store = mine?.store;
  const { data: blocked } = useBlockedAccounts();
  const { data: isAdmin } = useIsAdmin();
  const appearance = useAppearancePref();
  const language = useLanguagePref();
  const changeLanguage = (v: LangPref) => {
    const before = currentLang();
    setLanguage(v);
    // 換語言會重新整理所有畫面並回到首頁，這裡再帶回設定頁
    if (currentLang() !== before) setTimeout(() => router.push('/settings'), 50);
  };
  const { data: prefs } = useNotificationPrefs();
  const updatePrefs = useUpdatePrefs();
  const setPref = (patch: Partial<NotificationPrefs>) => updatePrefs.mutate(patch, { onError: (e) => Alert.alert(tr('沒有成功'), userMessage(e)) });

  const requestDeletion = () =>
    Alert.alert(tr('刪除你的書棲帳號？'), tr('送出後 30 天內重新登入可以取消；30 天後永久刪除書店與所有內容。'), [
      { text: tr('取消'), style: 'cancel' },
      {
        text: tr('刪除帳號'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('request_account_deletion', { p_reason: null });
          if (!error) track('account_delete_requested', { has_reason: false });
          if (error) return Alert.alert(tr('沒有成功'), userMessage(error));
          await signOut();
          router.navigate('/');
        },
      },
    ]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md }}>
        {store ? (
          <>
            <AppText variant="label">{tr('書店')}</AppText>
            <Card style={{ paddingVertical: 0 }}>
              <Pressable accessibilityRole="button" onPress={() => router.push('/store-edit')} style={[styles.row, { borderBottomColor: c.divider }]}>
                <AppText style={{ flex: 1 }}>{tr('書店資料')}</AppText>
                <AppText muted>{store.name}</AppText>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.push('/store-visibility')} style={[styles.row, { borderBottomColor: c.divider }]}>
                <AppText style={{ flex: 1 }}>{tr('公開設定')}</AppText>
                <AppText muted>{tr('書店頁顯示什麼')}</AppText>
              </Pressable>
              <View style={[styles.row, { borderBottomColor: c.divider }]}>
                <View style={{ flex: 1 }}>
                  <AppText>{tr('店主閱讀預設公開')}</AppText>
                  <AppText variant="caption" muted>{tr('新記錄的書會顯示在書店頁，每本都能再改')}</AppText>
                </View>
                <Toggle
                  accessibilityLabel={tr('店主閱讀預設公開')}
                  value={store.reading_public_default}
                  onValueChange={(v) => updateStore.mutate({ reading_public_default: v }, { onError: (e) => Alert.alert(tr('沒有成功'), userMessage(e)) })}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => shareStore(store.name, store.slug)}
                style={[styles.row, { borderBottomWidth: 0 }]}>
                <AppText style={{ flex: 1 }}>{tr('分享書店連結')}</AppText>
                <AppText muted>{storeLinkLabel(store.slug)}</AppText>
              </Pressable>
            </Card>
          </>
        ) : null}
        {prefs ? (
          <>
            <AppText variant="label">{tr('通知')}</AppText>
            <Card style={{ paddingVertical: 0 }}>
              <PrefRow label={tr('追蹤的書店有新策展')} value={prefs.new_curation_from_followed} onChange={(v) => setPref({ new_curation_from_followed: v })} />
              <PrefRow label={tr('每週回顧')} sub={tr('週一早上整理好上一週；上週沒有紀錄就不通知')} value={prefs.weekly_review} onChange={(v) => setPref({ weekly_review: v })} />
              {store ? <PrefRow label={tr('有人追蹤我的書店')} value={prefs.new_follower} onChange={(v) => setPref({ new_follower: v })} /> : null}
              {store ? (
                <PrefRow
                  label={tr('每月策展提醒')}
                  sub={tr('提醒你準備下個月的策展；下個月已發布就不提醒')}
                  value={prefs.monthly_reminder}
                  onChange={(v) => setPref({ monthly_reminder: v, reminder_day: prefs.reminder_day ?? 25 })}
                  last={!prefs.monthly_reminder}
                />
              ) : null}
              {store && prefs.monthly_reminder ? (
                <View style={[styles.row, { borderBottomWidth: 0, gap: Spacing.sm }]} accessibilityRole="radiogroup">
                  {([[20, tr('每月 20 日')], [25, tr('每月 25 日')], [-3, tr('月底前 3 天')]] as const).map(([d, label]) => (
                    <Chip key={d} label={label} selected={(prefs.reminder_day ?? 25) === d} onPress={() => setPref({ reminder_day: d })} />
                  ))}
                </View>
              ) : null}
            </Card>
            <AppText variant="caption" muted>{tr('通知需要允許書棲傳送通知；Expo Go 測試版收不到推播。')}</AppText>
          </>
        ) : null}
        {isAdmin === true ? <Button kind="secondary" label={tr('審核後台')} onPress={() => router.push('/admin')} /> : null}
        <AppText variant="label">{tr('外觀')}</AppText>
        <Card style={{ paddingVertical: Spacing.md }}>
          <View style={[styles.segment, { backgroundColor: c.surfaceMuted }]} accessibilityRole="radiogroup">
            {([['system', tr('跟隨系統')], ['light', tr('淺色')], ['dark', tr('深色')]] as const).map(([v, label]) => (
              <Pressable key={v} accessibilityRole="radio" accessibilityState={{ selected: appearance === v }} onPress={() => setAppearance(v)} style={[styles.segmentItem, appearance === v && { backgroundColor: c.surface }]}>
                <AppText variant="caption" style={{ fontWeight: '700', color: appearance === v ? c.text : c.textSecondary }}>{label}</AppText>
              </Pressable>
            ))}
          </View>
        </Card>
        <AppText variant="label">{tr('語言')}</AppText>
        <Card style={{ paddingVertical: Spacing.md, gap: Spacing.sm }}>
          <View style={[styles.segment, { backgroundColor: c.surfaceMuted }]} accessibilityRole="radiogroup">
            {([['system', tr('跟隨系統')], ['zh', '繁體中文'], ['en', 'English']] as const).map(([v, label]) => (
              <Pressable key={v} accessibilityRole="radio" accessibilityState={{ selected: language === v }} onPress={() => changeLanguage(v)} style={[styles.segmentItem, language === v && { backgroundColor: c.surface }]}>
                <AppText variant="caption" style={{ fontWeight: '700', color: language === v ? c.text : c.textSecondary }}>{label}</AppText>
              </Pressable>
            ))}
          </View>
          <AppText variant="caption" muted>{tr('書店名稱、策展與心得是店主寫的內容，不會被翻譯。')}</AppText>
        </Card>
        <AppText variant="label">{tr('帳號與其他')}</AppText>
        <Card style={{ paddingVertical: 0 }}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/blocked')} style={[styles.row, { borderBottomColor: c.divider }]}>
            <AppText style={{ flex: 1 }}>{tr('已封鎖的帳號')}</AppText>
            <AppText muted>{String(blocked?.length ?? 0)}</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/help')} style={[styles.row, { borderBottomColor: c.divider }]}>
            <AppText style={{ flex: 1 }}>{tr('說明與意見回饋')}</AppText>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })} style={[styles.row, { borderBottomColor: c.divider }]}>
            <AppText style={{ flex: 1 }}>{tr('服務條款')}</AppText>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })} style={[styles.row, { borderBottomWidth: 0 }]}>
            <AppText style={{ flex: 1 }}>{tr('隱私權政策')}</AppText>
          </Pressable>
        </Card>
        <Card style={{ gap: Spacing.sm }}>
          <AppText variant="label">{tr('版本')}</AppText>
          <AppText muted>{Constants.expoConfig?.version ?? '—'}</AppText>
        </Card>
        <Button kind="secondary" label={tr('登出')} onPress={async () => { await signOut(); router.navigate('/'); }} />
        <AppText variant="label" style={{ marginTop: Spacing.lg }}>{tr('危險區')}</AppText>
        {store ? <Button kind="secondary" label={tr('重設書店')} onPress={() => router.push('/store-delete')} /> : null}
        <Button kind="danger" label={tr('刪除帳號')} onPress={requestDeletion} />
      </ScrollView>
    </Screen>
  );
}

function PrefRow({ label, sub, value, onChange, last }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  const c = useTheme();
  return (
    <View style={[styles.row, last ? { borderBottomWidth: 0 } : { borderBottomColor: c.divider }]}>
      <View style={{ flex: 1 }}>
        <AppText>{label}</AppText>
        {sub ? <AppText variant="caption" muted>{sub}</AppText> : null}
      </View>
      <Toggle accessibilityLabel={label} value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: MinTouch + 12, paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segmentItem: { flex: 1, minHeight: MinTouch - 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
