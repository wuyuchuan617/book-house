import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Card, EmptyState, Screen } from '@/components/ui';
import { Radius, Spacing, StoreColors } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useFollowedStores } from '@/lib/queries';

/** B1 追蹤的書店。TODO(M3)：B2 收藏的書分頁、新策展提示 */
export default function SavedScreen() {
  const { session, requireAuth } = useAuth();
  const { data, isLoading } = useFollowedStores();

  return (
    <Screen>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <AppText variant="title" style={styles.title}>收藏</AppText>
        {!session ? (
          <EmptyState
            title="登入後就能收藏"
            body="追蹤喜歡的店主，每月新策展上架時第一個知道。"
            actionLabel="登入"
            onAction={() => requireAuth(() => {})}
          />
        ) : isLoading ? (
          <ActivityIndicator style={{ marginTop: 48 }} />
        ) : (
          <FlatList
            data={data}
            keyExtractor={(s) => s.id}
            contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md, flexGrow: 1 }}
            ListEmptyComponent={
              <EmptyState
                title="還沒有追蹤的書店"
                body="追蹤喜歡的店主，每月新策展上架時第一個知道。"
                actionLabel="去探索書店"
                onAction={() => router.navigate('/')}
              />
            }
            renderItem={({ item }) => (
              <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: item.slug } })}>
                <Card style={styles.row}>
                  <View style={[styles.avatar, { backgroundColor: StoreColors[item.color].hex }]}>
                    <AppText style={{ color: '#FFFFFF', fontWeight: '700' }}>{item.name.slice(0, 1)}</AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="label">{item.name}</AppText>
                    <AppText variant="caption" muted>{`${item.owner_name} · ${item.follower_count} 人追蹤`}</AppText>
                  </View>
                </Card>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
});
