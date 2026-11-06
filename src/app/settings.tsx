import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Switch, View } from 'react-native';

import { AppText, Button, Card, Screen } from '@/components/ui';
import { MinTouch, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMyStore } from '@/lib/queries';
import { useUpdateStore } from '@/lib/readings';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/** M3 設定。TODO(M5／M6)：通知、外觀、說明與意見回饋、已封鎖帳號、暫停營業 */
export default function SettingsScreen() {
  const { signOut } = useAuth();
  const c = useTheme();
  const { data: mine } = useMyStore();
  const updateStore = useUpdateStore();
  const store = mine?.store;

  const requestDeletion = () =>
    Alert.alert('刪除你的書棲帳號？', '送出後 30 天內重新登入可以取消；30 天後永久刪除書店與所有內容。', [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除帳號',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('request_account_deletion', { p_reason: null });
          if (error) return Alert.alert('沒有成功', error.message);
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
                  onValueChange={(v) => updateStore.mutate({ reading_public_default: v }, { onError: (e) => Alert.alert('沒有成功', e.message) })}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => Share.share({ message: `來逛逛「${store.name}」：https://bookhaus.app/${store.slug}` })}
                style={[styles.row, { borderBottomWidth: 0 }]}>
                <AppText style={{ flex: 1 }}>分享書店連結</AppText>
                <AppText muted>{`bookhaus.app/${store.slug}`}</AppText>
              </Pressable>
            </Card>
          </>
        ) : null}
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: MinTouch + 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
