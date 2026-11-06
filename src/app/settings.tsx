import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, ScrollView } from 'react-native';

import { AppText, Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/** M3 設定。TODO(M4)：M2 編輯書店、M4 分享、M7 說明、M9 刪除書店、已封鎖帳號、語言 */
export default function SettingsScreen() {
  const { signOut } = useAuth();

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
        <Card style={{ gap: Spacing.sm }}>
          <AppText variant="label">版本</AppText>
          <AppText muted>{Constants.expoConfig?.version ?? '—'}</AppText>
        </Card>
        <Button kind="secondary" label="登出" onPress={async () => { await signOut(); router.navigate('/'); }} />
        <AppText variant="label" style={{ marginTop: Spacing.lg }}>危險區</AppText>
        <Button kind="danger" label="刪除帳號" onPress={requestDeletion} />
      </ScrollView>
    </Screen>
  );
}
