import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { FollowButton, StoreAvatar } from '@/components/social';
import { AppText, Card, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';
import { monthOf } from '@/lib/period';
import { useMyStore } from '@/lib/queries';
import { useMyFollowList, useStoreInsights, type FollowRow } from '@/lib/store-v16';

type Kind = 'followers' | 'following';

/** W3 追蹤者／追蹤中：從我的書店的「38 追蹤者 ›」「12 追蹤中 ›」進來；名單只有店主自己看得到 */
export default function FollowsScreen() {
  const c = useTheme();
  const params = useLocalSearchParams<{ kind?: Kind }>();
  const [kind, setKind] = useState<Kind>(params.kind === 'following' ? 'following' : 'followers');
  const { data: mine } = useMyStore();
  const insights = useStoreInsights();
  const list = useMyFollowList(kind);
  const counts = {
    followers: insights.data?.followers ?? mine?.stats?.follower_count ?? 0,
    following: insights.data?.following ?? 0,
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: mine?.store.name ?? tr('我的書店') }} />
      <View style={[styles.segment, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
        {(['followers', 'following'] as Kind[]).map((k) => {
          const on = kind === k;
          return (
            <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setKind(k)} style={[styles.segmentItem, on && { backgroundColor: c.surface }]}>
              <AppText variant="caption" style={{ fontWeight: '700', color: on ? c.text : c.textSecondary }}>
                {k === 'followers' ? tr('追蹤者 · {n}', { n: counts.followers }) : tr('追蹤中 · {n}', { n: counts.following })}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {list.isPending ? (
        <ActivityIndicator style={{ marginTop: 48 }} />
      ) : list.error ? (
        <EmptyState title={tr('沒有載入成功')} body={tr('檢查網路後再試一次。')} actionLabel={tr('重試')} onAction={() => void list.refetch()} />
      ) : (
        <FlatList
          data={list.data}
          keyExtractor={(r) => r.store_id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
          ListEmptyComponent={
            kind === 'followers' ? (
              <EmptyState title={tr('還沒有人追蹤你的書店')} body={tr('發布策展、公開貼文，讀者就會找到你。')} />
            ) : (
              <EmptyState title={tr('還沒有追蹤的書店')} body={tr('追蹤喜歡的店主，\n每月新策展上架時第一個知道。')} actionLabel={tr('去探索書店')} onAction={() => router.navigate('/')} />
            )
          }
          renderItem={({ item }) => <Row row={item} />}
        />
      )}
    </Screen>
  );
}

function Row({ row }: { row: FollowRow }) {
  const sub = row.latest ? tr('{m} 月策展 · {n} 本書', { m: monthOf(row.latest.period), n: row.latest.book_count }) : row.tagline || tr('籌備中');
  return (
    <Card style={{ paddingVertical: Spacing.md }}>
      <View style={styles.row}>
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: row.slug } })} style={[styles.row, { flex: 1 }]}>
          <StoreAvatar name={row.name} color={row.color} size={42} path={row.avatar_path} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label" numberOfLines={1}>{row.name}</AppText>
            <AppText variant="caption" muted numberOfLines={1}>{sub}</AppText>
          </View>
        </Pressable>
        <FollowButton bookstoreId={row.store_id} storeName={row.name} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', marginHorizontal: Spacing.xl, marginTop: Spacing.md, borderRadius: Radius.md, padding: 3 },
  segmentItem: { flex: 1, minHeight: MinTouch - 4, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  list: { padding: Spacing.xl, gap: Spacing.sm, flexGrow: 1, paddingBottom: 48 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
});
