import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { PlaceRow } from '@/components/diary';
import { Chip } from '@/components/form';
import { AppText, EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { categoryLabel, PLACE_FILTERS, useExplorePlaces, type PlaceFilter, type PlaceSort } from '@/lib/diary';
import { tr } from '@/lib/i18n';
import { approximateLocation, locationAvailable, type Coords } from '@/lib/location';

const SORTS = (): [PlaceSort, string][] => [['near', tr('附近')], ['latest', tr('最新打卡')], ['saves', tr('最多人想去')]];

/** L2 探索 → 書的地方：有公開打卡的地點（附近／最新／最多收藏、類型篩選） */
export function PlacesExplore() {
  const c = useTheme();
  const { requireAuth } = useAuth();
  const [sort, setSort] = useState<PlaceSort>(locationAvailable() ? 'near' : 'latest');
  const [category, setCategory] = useState<PlaceFilter | undefined>();
  const [near, setNear] = useState<Coords | null>(null);
  const [noLocation, setNoLocation] = useState(false);

  useEffect(() => {
    if (sort !== 'near' || near) return;
    let alive = true;
    void approximateLocation({ ask: true }).then((p) => {
      if (!alive) return;
      if (p) setNear(p);
      else {
        setNoLocation(true);
        setSort('latest');
      }
    });
    return () => {
      alive = false;
    };
  }, [sort, near]);

  const waiting = sort === 'near' && !near;
  const list = useExplorePlaces(waiting ? 'latest' : sort, category, near);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.sortRow} accessibilityRole="radiogroup">
        {SORTS().map(([s, label]) => (
          <Pressable key={s} accessibilityRole="radio" accessibilityState={{ selected: sort === s }} onPress={() => { setNoLocation(false); setSort(s); }} hitSlop={8} style={styles.sortItem}>
            <AppText variant="caption" style={{ fontWeight: sort === s ? '700' : '500', color: sort === s ? c.primary : c.textSecondary }}>{label}</AppText>
          </Pressable>
        ))}
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={tr('全部類型')} selected={!category} onPress={() => setCategory(undefined)} />
          {PLACE_FILTERS.map((k) => <Chip key={k} label={categoryLabel(k)} selected={category === k} onPress={() => setCategory(category === k ? undefined : k)} />)}
        </ScrollView>
      </View>
      {noLocation ? <AppText variant="caption" muted style={{ paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm }}>{tr('拿不到位置，先依最新打卡排序。')}</AppText> : null}

      {list.isPending || waiting ? (
        <ActivityIndicator style={{ marginTop: 48 }} />
      ) : list.error ? (
        <EmptyState title={tr('沒有載入成功')} body={tr('檢查網路後再試一次。')} actionLabel={tr('重試')} onAction={() => void list.refetch()} />
      ) : (
        <FlatList
          data={list.data}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.md, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
          renderItem={({ item }) => (
            <PlaceRow
              place={item}
              meta={[tr('{n} 則打卡', { n: item.checkin_count }), item.save_count ? tr('{n} 人想去', { n: item.save_count }) : null].filter(Boolean).join(' · ')}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title={category ? tr('還沒有「{name}」的打卡', { name: categoryLabel(category) }) : tr('還沒有公開的打卡')}
              body={tr('在書店、圖書館、咖啡店打卡並選擇公開，地點就會出現在這裡，讓更多人找到有書的地方。')}
              actionLabel={tr('去打卡')}
              onAction={() => requireAuth(() => router.push({ pathname: '/diary/compose', params: { kind: 'checkin' } }))}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sortRow: { flexDirection: 'row', gap: Spacing.lg, paddingHorizontal: Spacing.xl, paddingTop: Spacing.md },
  sortItem: { minHeight: 32, justifyContent: 'center' },
  chips: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.sm },
});
