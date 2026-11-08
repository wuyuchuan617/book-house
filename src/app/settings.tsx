import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Switch, View } from 'react-native';

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
import { shareStoreMessage, storeLinkLabel } from '@/lib/links';
import { useNotificationPrefs, useUpdatePrefs, type NotificationPrefs } from '@/lib/notification-prefs';
import { Chip } from '@/components/form';
import { userMessage } from '@/lib/errors';

/** M3 設定：書店、通知（含 M5 每月策展提醒）、已封鎖的帳號、說明與意見回饋、條款。TODO(V2)：外觀、暫停營業 */
export default function SettingsScreen() {
  const { signOut } = useAuth();
  const c = useTheme();
  const { data: mine } = useMyStore();
  const updateStore = useUpdateStore();
  const store = mine?.store;
  const { data: blocked } = useBlockedAccounts();
  const { data: isAdmin } = useIsAdmin();
  const appearance = useAppearancePref();
  const { data: prefs } = useNotificationPrefs();
  const updatePrefs = useUpdatePrefs();
  const setPref = (patch: Partial<NotificationPrefs>) => updatePrefs.mutate(patch, { onError: (e) => Alert.alert('沒有成功', userMessage(e)) });

  const requestDeletion = () =>
    Alert.alert('刪除你的書棲帳號？', '送出後 30 天內重新登入可以取消；30 天後永久刪除書店與所有內容。', [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除帳號',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('request_account_deletion', { p_reason: null });
          if (!error) track('account_delete_requested', { has_reason: false });
          if (error) return Alert.alert('沒有成功', userMessage(error));
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
            <AppText variant="label">書店</AppText>
            <Card style={{ paddingVertical: 0 }}>
              <Pressable accessibilityRole="button" onPress={() => router.push('/store-edit')} style={[styles.row, { borderBottomColor: c.divider }]}>
                <AppText style={{ flex: 1 }}>書店資料</AppText>
                <AppText muted>{store.name}</AppText>
              </Pressable>
              <View style={[styles.row, { borderBottomColor: c.divider }]}>
                <View style={{ flex: 1 }}>
                  <AppText>店主閱讀預設公開</AppText>
                  <AppText variant="caption" muted>新記錄的書會顯示在書店頁，每本都能再改</AppText>
                </View>
                <Switch
                  accessibilityLabel="店主閱讀預設公開"
                  value={store.reading_public_default}
                  onValueChange={(v) => updateStore.mutate({ reading_public_default: v }, { onError: (e) => Alert.alert('沒有成功', userMessage(e)) })}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => { track('share_link_copied', { channel: 'system' }); void Share.share({ message: shareStoreMessage(store.name, store.slug) }); }}
                style={[styles.row, { borderBottomWidth: 0 }]}>
                <AppText style={{ flex: 1 }}>分享書店連結</AppText>
                <AppText muted>{storeLinkLabel(store.slug)}</AppText>
              </Pressable>
            </Card>
          </>
        ) : null}
        {prefs ? (
          <>
            <AppText variant="label">通知</AppText>
            <Card style={{ paddingVertical: 0 }}>
              <PrefRow label="追蹤的書店有新策展" value={prefs.new_curation_from_followed} onChange={(v) => setPref({ new_curation_from_followed: v })} />
              {store ? <PrefRow label="有人追蹤我的書店" value={prefs.new_follower} onChange={(v) => setPref({ new_follower: v })} /> : null}
              {store ? (
                <PrefRow
                  label="每月策展提醒"
                  sub="提醒你準備下個月的策展；下個月已發布就不提醒"
                  value={prefs.monthly_reminder}
                  onChange={(v) => setPref({ monthly_reminder: v, reminder_day: prefs.reminder_day ?? 25 })}
                  last={!prefs.monthly_reminder}
                />
              ) : null}
              {store && prefs.monthly_reminder ? (
                <View style={[styles.row, { borderBottomWidth: 0, gap: Spacing.sm }]} accessibilityRole="radiogroup">
                  {([[20, '每月 20 日'], [25, '每月 25 日'], [-3, '月底前 3 天']] as const).map(([d, label]) => (
                    <Chip key={d} label={label} selected={(prefs.reminder_day ?? 25) === d} onPress={() => setPref({ reminder_day: d })} />
                  ))}
                </View>
              ) : null}
            </Card>
            <AppText variant="caption" muted>通知需要允許書棲傳送通知；Expo Go 測試版收不到推播。</AppText>
          </>
        ) : null}
        {isAdmin === true ? <Button kind="secondary" label="審核後台" onPress={() => router.push('/admin')} /> : null}
        <AppText variant="label">外觀</AppText>
        <Card style={{ paddingVertical: Spacing.md }}>
          <View style={[styles.segment, { backgroundColor: c.surfaceMuted }]} accessibilityRole="radiogroup">
            {([['system', '跟隨系統'], ['light', '淺色'], ['dark', '深色']] as const).map(([v, label]) => (
              <Pressable key={v} accessibilityRole="radio" accessibilityState={{ selected: appearance === v }} onPress={() => setAppearance(v)} style={[styles.segmentItem, appearance === v && { backgroundColor: c.surface }]}>
                <AppText variant="caption" style={{ fontWeight: '700', color: appearance === v ? c.text : c.textSecondary }}>{label}</AppText>
              </Pressable>
            ))}
          </View>
        </Card>
        <AppText variant="label">帳號與其他</AppText>
        <Card style={{ paddingVertical: 0 }}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/blocked')} style={[styles.row, { borderBottomColor: c.divider }]}>
            <AppText style={{ flex: 1 }}>已封鎖的帳號</AppText>
            <AppText muted>{String(blocked?.length ?? 0)}</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/help')} style={[styles.row, { borderBottomColor: c.divider }]}>
            <AppText style={{ flex: 1 }}>說明與意見回饋</AppText>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })} style={[styles.row, { borderBottomColor: c.divider }]}>
            <AppText style={{ flex: 1 }}>服務條款</AppText>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })} style={[styles.row, { borderBottomWidth: 0 }]}>
            <AppText style={{ flex: 1 }}>隱私權政策</AppText>
          </Pressable>
        </Card>
        <Card style={{ gap: Spacing.sm }}>
          <AppText variant="label">版本</AppText>
          <AppText muted>{Constants.expoConfig?.version ?? '—'}</AppText>
        </Card>
        <Button kind="secondary" label="登出" onPress={async () => { await signOut(); router.navigate('/'); }} />
        <AppText variant="label" style={{ marginTop: Spacing.lg }}>危險區</AppText>
        {store ? <Button kind="secondary" label="刪除書店" onPress={() => router.push('/store-delete')} /> : null}
        <Button kind="danger" label="刪除帳號" onPress={requestDeletion} />
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
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: MinTouch + 12, borderBottomWidth: StyleSheet.hairlineWidth },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segmentItem: { flex: 1, minHeight: MinTouch - 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
