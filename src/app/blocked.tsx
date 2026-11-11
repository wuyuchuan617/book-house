import { Stack } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, View } from 'react-native';

import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useBlockedAccounts, useUnblock } from '@/lib/safety';
import { tr } from '@/lib/i18n';

/** 設定 › 已封鎖的帳號 */
export default function BlockedScreen() {
  const { data, isLoading } = useBlockedAccounts();
  const unblock = useUnblock();

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('已封鎖的帳號') }} />
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(b) => b.blocked_id}
          contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md, flexGrow: 1 }}
          ListEmptyComponent={<EmptyState title={tr('沒有封鎖任何人')} body={tr('在書店頁的 ⋯ 選單可以封鎖店主，你就不會再看到他的內容。')} />}
          renderItem={({ item }) => (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
              <View style={{ flex: 1 }}>
                <AppText variant="label">{item.display_name}</AppText>
                <AppText variant="caption" muted>{item.store_name ? tr('書店「{store_name}」', { store_name: item.store_name }) : tr('沒有開書店')}</AppText>
              </View>
              <Button
                kind="secondary"
                label={tr('解除封鎖')}
                loading={unblock.isPending && unblock.variables === item.blocked_id}
                onPress={() =>
                  Alert.alert(tr('解除封鎖{display_name}？', { display_name: item.display_name }), tr('你會再看到他的書店與內容；之前的追蹤不會自動恢復。'), [
                    { text: tr('取消'), style: 'cancel' },
                    { text: tr('解除封鎖'), onPress: () => unblock.mutate(item.blocked_id) },
                  ])
                }
              />
            </Card>
          )}
        />
      )}
    </Screen>
  );
}
