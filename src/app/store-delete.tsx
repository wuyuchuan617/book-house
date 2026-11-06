import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';

import { TextField } from '@/components/form';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMyStore } from '@/lib/queries';
import { useDeleteStore, useStoreDeleteImpact } from '@/lib/readings';

/** M9 刪除書店：輸入店名確認。帳號還在，之後可以重新開店 */
export default function StoreDeleteScreen() {
  const c = useTheme();
  const { data } = useMyStore();
  const { data: impact, isLoading } = useStoreDeleteImpact(true);
  const del = useDeleteStore();
  const [confirm, setConfirm] = useState('');

  if (!data || isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  const name = data.store.name;

  return (
    <Screen>
      <Stack.Screen options={{ title: '刪除書店' }} />
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
        <AppText variant="heading">{`刪除「${name}」？`}</AppText>
        <View style={{ gap: 4 }}>
          <AppText muted>刪除後無法復原，以下內容會一起刪除：</AppText>
          <AppText>{`• ${impact?.curation_count ?? 0} 檔策展與書架上的書`}</AppText>
          <AppText>{`• ${impact?.reading_count ?? 0} 筆店主閱讀與心得`}</AppText>
          <AppText>{`• ${impact?.follower_count ?? 0} 位追蹤者會收不到你的更新`}</AppText>
          <AppText>{`• 網址 bookhaus.app/${impact?.slug ?? data.store.slug} 會被釋出`}</AppText>
        </View>
        <Card style={{ gap: 4, backgroundColor: c.surfaceMuted }}>
          <AppText variant="label">只是想休息？</AppText>
          <AppText variant="caption" muted>暫停營業（內容都保留）會在之後的版本推出。現在也可以先把策展取消發布，讀者就看不到內容。</AppText>
        </Card>
        <TextField label={`請輸入書店名稱「${name}」以確認`} value={confirm} onChangeText={setConfirm} autoCapitalize="none" />
        <Button
          kind="danger"
          label="永久刪除書店"
          disabled={confirm.trim() !== name}
          loading={del.isPending}
          onPress={() =>
            del.mutate(undefined, {
              onSuccess: () => {
                Alert.alert('書店已刪除', '你的帳號還在，之後隨時可以重新開店。');
                router.navigate('/my-store');
              },
              onError: (e) => Alert.alert('沒有刪除成功', e.message),
            })
          }
        />
        <Button kind="link" label="取消" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}
