import { Link } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui';
import { Radius, Spacing, StoreColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useExploreFeed, useToggleFollow, type ExploreItem } from '@/lib/queries';

/** A2 探索：當月已發布的策展。TODO(M3)：搜尋、主題篩選、追蹤狀態 */
export default function ExploreScreen() {
  const { data, isLoading, error, refetch } = useExploreFeed();
  const month = new Date().getMonth() + 1;

  return (
    <Screen>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={styles.header}>
          <AppText variant="title">探索</AppText>
          <AppText variant="caption" muted>{`${month} 月 · ${data?.length ?? 0} 檔策展`}</AppText>
        </View>
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 48 }} />
        ) : error ? (
          <EmptyState title="目前沒有網路連線" body="連上網路後再試一次。" actionLabel="重試" onAction={() => refetch()} />
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.curation_id}
            contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md, flexGrow: 1 }}
            renderItem={({ item }) => <CurationCard item={item} />}
            ListEmptyComponent={
              <EmptyState title="這個月還沒有策展" body="第一間書店開張後，策展就會出現在這裡。" />
            }
          />
        )}
      </SafeAreaView>
    </Screen>
  );
}

function CurationCard({ item }: { item: ExploreItem }) {
  const c = useTheme();
  const { requireAuth } = useAuth();
  const follow = useToggleFollow();
  const color = StoreColors[item.color]?.hex ?? StoreColors.moss.hex;

  return (
    <Link href={{ pathname: '/store/[slug]', params: { slug: item.slug } }} asChild>
      <Pressable accessibilityRole="link">
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <View style={[styles.band, { backgroundColor: color }]}>
            <AppText variant="caption" style={styles.bandText}>{`${item.book_count} 本書`}</AppText>
          </View>
          <View style={{ padding: Spacing.lg, gap: Spacing.xs }}>
            <AppText variant="heading">{item.title}</AppText>
            {item.description ? <AppText muted numberOfLines={2}>{item.description}</AppText> : null}
            <View style={styles.storeRow}>
              <View style={[styles.avatar, { backgroundColor: color }]}>
                <AppText style={{ color: '#FFFFFF', fontWeight: '700' }}>{item.store_name.slice(0, 1)}</AppText>
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="label">{item.store_name}</AppText>
                <AppText variant="caption" style={{ color: c.textTertiary }}>{`${item.owner_name} · ${item.follower_count} 人追蹤`}</AppText>
              </View>
              <Button
                label="＋ 追蹤"
                style={styles.follow}
                onPress={() => requireAuth(() => follow.mutate({ bookstoreId: item.bookstore_id, follow: true }))}
              />
            </View>
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  band: { height: 96, padding: Spacing.md, alignItems: 'flex-end' },
  bandText: { color: '#FFFFFF', fontWeight: '700' },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  avatar: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  follow: { minHeight: 44, paddingHorizontal: Spacing.md },
});
