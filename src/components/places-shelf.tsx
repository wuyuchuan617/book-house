import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { PlaceRow, WantEventFooter } from '@/components/diary';
import { SwipeRow, swipeA11y, type SwipeAction } from '@/components/swipe-row';
import { AppText, EmptyState } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMyPlaces, useSavePlace, type MyPlace, type MyPlaceKind } from '@/lib/diary';
import { tr } from '@/lib/i18n';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** L3 書櫃 › 地方：想去（存了還沒去）／去過（打過卡）；「＋ 加地方」直接搜尋存成想去 */
export function PlacesShelf() {
  const c = useTheme();
  const [kind, setKind] = useState<MyPlaceKind>('want');
  const list = useMyPlaces(kind);
  // 「＋ 加地方」與編輯都開寫日記頁的「想去」
  const add = () => router.push({ pathname: '/diary/compose', params: { kind: 'want' } });
  const edit = (p: MyPlace) =>
    router.push({
      pathname: '/diary/compose',
      params: {
        kind: 'want',
        placeId: p.id,
        placeName: p.name,
        googlePlaceId: 'saved',
        publicOk: '0',
        saved: '1',
        note: p.note ?? '',
        ...(p.event_starts_on ? { eventStart: p.event_starts_on } : {}),
        ...(p.event_ends_on ? { eventEnd: p.event_ends_on } : {}),
        ...(p.event_url ? { eventUrl: p.event_url } : {}),
      },
    });
  const remove = useSavePlace();

  const meta = (p: MyPlace) =>
    kind === 'want'
      ? p.note ?? (p.checkin_count ? tr('{n} 則打卡', { n: p.checkin_count }) : tr('還沒去過'))
      : [tr('你來過 {n} 次', { n: p.my_checkins }), p.last_visit ? tr('最近 {date}', { date: md(p.last_visit) }) : null].filter(Boolean).join(' · ');

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.bar}>
        <View style={{ flexDirection: 'row', gap: Spacing.sm }} accessibilityRole="tablist">
          {(['want', 'visited'] as const).map((k) => (
            <Pressable
              key={k}
              accessibilityRole="tab"
              accessibilityState={{ selected: kind === k }}
              onPress={() => setKind(k)}
              style={[styles.pill, { backgroundColor: kind === k ? c.text : c.surface, borderColor: kind === k ? c.text : c.border }]}>
              <AppText variant="caption" style={{ fontWeight: '700', color: kind === k ? c.background : c.text }}>{k === 'want' ? tr('想去') : tr('去過')}</AppText>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={() => add()} hitSlop={8} style={styles.add}>
          <Feather name="plus" size={16} color={c.primary} />
          <AppText variant="label" style={{ color: c.primary }}>{tr('加地方')}</AppText>
        </Pressable>
      </View>

      {list.isLoading ? (
        <ActivityIndicator style={{ marginTop: 48 }} />
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
          renderItem={({ item }) => {
            if (kind !== 'want') return <PlaceRow place={item} isIndie={item.is_indie} meta={meta(item)} />;
            const actions: SwipeAction[] = [
              { label: tr('編輯'), icon: 'edit-2', onPress: () => edit(item) },
              { label: tr('移除'), icon: 'trash-2', destructive: true, onPress: () => remove.mutate({ placeId: item.id, save: false }) },
            ];
            return (
              <View style={{ borderRadius: Radius.xl, overflow: 'hidden' }} {...swipeA11y(actions)}>
                <SwipeRow actions={actions}>
                  <PlaceRow place={item} isIndie={item.is_indie} meta={meta(item)} footer={<WantEventFooter startsOn={item.event_starts_on} endsOn={item.event_ends_on} url={item.event_url} />} />
                </SwipeRow>
              </View>
            );
          }}
          ListFooterComponent={kind === 'want' && list.data?.length ? <AppText variant="caption" muted style={{ textAlign: 'center' }}>{tr('往左滑可以修改原因或移除；在那裡打卡後會移到「去過」。')}</AppText> : undefined}
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingTop: Spacing.md },
  pill: { minHeight: 34, paddingHorizontal: 16, borderRadius: Radius.pill, borderWidth: 1, justifyContent: 'center' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: MinTouch },
  list: { padding: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.md, flexGrow: 1 },
});
