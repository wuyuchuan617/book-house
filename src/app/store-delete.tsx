import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';

import { TextField } from '@/components/form';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMyStore } from '@/lib/queries';
import { useDeleteStore, useStoreDeleteImpact } from '@/lib/readings';
import { storeLinkLabel } from '@/lib/links';
import { userMessage } from '@/lib/errors';
import { tr } from '@/lib/i18n';

/** 重設書店（v1.5：每個人都有書店）：輸入店名確認。刪掉內容後馬上開一間新的空書店 */
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
      <Stack.Screen options={{ title: tr('重設書店') }} />
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
        <AppText variant="heading">{tr('重設「{name}」？', { name })}</AppText>
        <View style={{ gap: 4 }}>
          <AppText muted>{tr('重設後無法復原，以下內容會清空，然後換成一間新的空書店：')}</AppText>
          <AppText>{tr('• {p0} 檔策展與書架上的書', { p0: impact?.curation_count ?? 0 })}</AppText>
          <AppText>{tr('• {p0} 筆店主閱讀與心得', { p0: impact?.reading_count ?? 0 })}</AppText>
          <AppText>{tr('• {p0} 位追蹤者會收不到你的更新', { p0: impact?.follower_count ?? 0 })}</AppText>
          <AppText>{tr('• 網址 {p0} 會被釋出', { p0: storeLinkLabel(impact?.slug ?? data.store.slug) })}</AppText>
        </View>
        <Card style={{ gap: 4, backgroundColor: c.surfaceMuted }}>
          <AppText variant="label">{tr('只是想休息？')}</AppText>
          <AppText variant="caption" muted>{tr('暫停營業（內容都保留）會在之後的版本推出。現在也可以先把策展取消發布，讀者就看不到內容。')}</AppText>
        </Card>
        <TextField label={tr('請輸入書店名稱「{name}」以確認', { name })} value={confirm} onChangeText={setConfirm} autoCapitalize="none" />
        <Button
          kind="danger"
          label={tr('重設書店')}
          disabled={confirm.trim() !== name}
          loading={del.isPending}
          onPress={() =>
            del.mutate(undefined, {
              onSuccess: () => {
                Alert.alert(tr('書店已重設'), tr('已經幫你開好一間新的空書店，名字和顏色可以再改。'));
                router.navigate('/my-store');
              },
              onError: (e) => Alert.alert(tr('沒有重設成功'), userMessage(e)),
            })
          }
        />
        <Button kind="link" label={tr('取消')} onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}
