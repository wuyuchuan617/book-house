import { ListSkeleton } from '@/components/skeleton';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { PlaceRow } from '@/components/diary';
import { ActionSheet } from '@/components/sheet';
import { MoreButton, SwipeRow, swipeA11y, type SwipeAction } from '@/components/swipe-row';
import { AppText, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMyPlaces, useSavePlace, type MyPlace, type MyPlaceKind } from '@/lib/diary';
import { useMyTrips } from '@/lib/trips';
import { TripCard } from '@/components/trips';
import { tr } from '@/lib/i18n';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** L3 收藏 › 地點：想去（存了還沒去）／去過（打過卡）／書旅（收藏的書旅） */
export function PlacesShelf({ right }: { right?: React.ReactNode } = {}) {
  const c = useTheme();
  const [tab, setKind] = useState<MyPlaceKind | 'trips'>('want');
  const kind: MyPlaceKind = tab === 'trips' ? 'want' : tab;
  const list = useMyPlaces(kind);
  const trips = useMyTrips();
  // 「＋ 加地方」與編輯都開寫日記頁的「想去」
  const add = () => router.push({ pathname: '/diary/compose', params: { kind: 'want' } });
  const edit = (p: MyPlace) =>
    router.push({ pathname: '/diary/compose', params: { kind: 'want', placeId: p.id, placeName: p.name, googlePlaceId: 'saved', publicOk: '0', saved: '1', note: p.note ?? '' } });
  const remove = useSavePlace();
  const [menuFor, setMenuFor] = useState<MyPlace | null>(null);
  const actionsFor = (p: MyPlace): SwipeAction[] => [
    { label: tr('編輯'), icon: 'edit-2', onPress: () => edit(p) },
    { label: tr('移除'), icon: 'trash-2', destructive: true, onPress: () => remove.mutate({ placeId: p.id, save: false }) },
  ];

  const meta = (p: MyPlace) =>
    kind === 'want'
      ? (p.note ? tr('「{note}」', { note: p.note }) : null) ?? (p.checkin_count ? tr('{n} 則打卡', { n: p.checkin_count }) : tr('還沒去過'))
      : [tr('你來過 {n} 次', { n: p.my_checkins }), p.last_visit ? tr('最近 {date}', { date: md(p.last_visit) }) : null].filter(Boolean).join(' · ');

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.bar}>
        <View style={{ flexDirection: 'row', gap: Spacing.sm }} accessibilityRole="tablist">
          {(['want', 'visited', 'trips'] as const).map((k) => (
            <Pressable
              key={k}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === k }}
              onPress={() => setKind(k)}
              style={[styles.pill, { backgroundColor: tab === k ? c.text : c.surface, borderColor: tab === k ? c.text : c.border }]}>
              <AppText variant="caption" style={{ fontWeight: '700', color: tab === k ? c.background : c.text }}>{k === 'want' ? tr('想去') : k === 'visited' ? tr('去過') : tr('書旅')}</AppText>
            </Pressable>
          ))}
        </View>
        {/* v1.8.3 AK20：「？」放這一行最右邊；不再有「＋ 加地方」（用右下角＋） */}
        {right}
      </View>

      {tab === 'trips' ? (
        trips.isPending ? (
          <ListSkeleton />
        ) : (
          <FlatList
            data={trips.data?.saved ?? []}
            keyExtractor={(t) => t.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={trips.isRefetching} onRefresh={() => void trips.refetch()} />}
            ListEmptyComponent={<EmptyState title={tr('還沒有收藏的書旅')} body={tr('在書旅頁按書籤收藏，要出發時從這裡打開。')} actionLabel={tr('看看大家的書旅')} onAction={() => router.navigate({ pathname: '/', params: { tab: 'trips' } })} />}
            renderItem={({ item }) => <TripCard t={item} />}
          />
        )
      ) : list.isLoading ? (
        <ListSkeleton />
      ) : (
        <FlatList
          data={list.data}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
          ListEmptyComponent={
            kind === 'want' ? (
              <EmptyState title={tr('還沒有想去的地方')} body={tr('看到喜歡的書店、圖書館，先存起來，下次經過就去看看。')} actionLabel={tr('加一個地方')} onAction={() => add()} />
            ) : (
              <EmptyState title={tr('還沒有去過的地方')} body={tr('在有書的地方打卡，就會記在這裡。')} actionLabel={tr('去打卡')} onAction={() => router.push({ pathname: '/diary/compose', params: { kind: 'checkin' } })} />
            )
          }
          renderItem={({ item, index }) => {
            if (kind !== 'want') return <PlaceRow place={item} isIndie={item.is_indie} meta={meta(item)} />;
            const actions = actionsFor(item);
            return (
              <View style={{ borderRadius: Radius.xl, overflow: 'hidden' }} {...swipeA11y(actions)}>
                <SwipeRow actions={actions} hint={index === 0}>
                  <PlaceRow place={item} isIndie={item.is_indie} meta={meta(item)} right={<MoreButton onPress={() => setMenuFor(item)} label={tr('{name}的更多動作', { name: item.name })} />} />
                </SwipeRow>
              </View>
            );
          }}
          ListFooterComponent={kind === 'want' && list.data?.length ? <AppText variant="caption" muted style={{ textAlign: 'center' }}>{tr('點「⋯」或往左滑可以修改原因或移除；在那裡打卡後會移到「去過」。')}</AppText> : undefined}
        />
      )}
      <ActionSheet visible={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.name} actions={menuFor ? actionsFor(menuFor) : []} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingTop: Spacing.md },
  pill: { minHeight: 34, paddingHorizontal: 16, borderRadius: Radius.pill, borderWidth: 1, justifyContent: 'center' },
  list: { padding: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.md, flexGrow: 1, paddingBottom: 96 },
  more: { position: 'absolute', top: 6, right: 6 },
});
