import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/sheet';
import { StoreAvatar } from '@/components/social';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { TRIP_BG, TRIP_FG } from '@/components/trips';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { tr } from '@/lib/i18n';
import { daysLabel, openTripMap, SLOT_LABEL, stopKind, tripError, useDeleteTrip, useSaveTripPlaces, useTripDetail, useTripSave, walkLabel, walkMinutes, type TripStop } from '@/lib/trips';

/** AG2／v1.8.1 AJ4 書旅單頁：城市、作者、標題、四格數字；分天的時間軸（每站一句推薦、到下一站走路時間）；下面固定：收藏、地圖路線、全部加進想去 */
export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const { requireAuth } = useAuth();
  const { data: t, isLoading, refetch, isRefetching } = useTripDetail(id);
  const save = useTripSave();
  const savePlaces = useSaveTripPlaces();
  const del = useDeleteTrip();
  const [day, setDay] = useState(1);
  const [menu, setMenu] = useState(false);

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!t) return <EmptyState title={tr('找不到這份書旅')} body={tr('它可能還是草稿，或已經刪除了。')} />;

  const stops = t.stops ?? [];
  const dayCount = Math.max(1, ...stops.map((s) => s.day));
  const shown = stops.filter((s) => s.day === Math.min(day, dayCount));
  const fail = (e: Error) => Alert.alert(tr('沒有成功'), tripError(e.message));
  const share = () => void Share.share({ message: `${t.title}（${t.city}）\n${stops.map((s, i) => `${i + 1}. ${s.place.name}`).join('\n')}` });
  const addAll = () =>
    requireAuth(() =>
      savePlaces.mutate(t.id, {
        onSuccess: (n) => Alert.alert(n ? tr('加了 {n} 個地點到想去', { n }) : tr('這些地點都已經在想去了'), tr('在書櫃 › 地點可以看到。')),
        onError: fail,
      }),
    );

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={tr('更多操作')} onPress={() => setMenu(true)} style={{ padding: 8 }}>
              <Feather name="more-horizontal" size={22} color={c.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <View style={[styles.city, { backgroundColor: TRIP_BG }]}>
              <Feather name="map" size={11} color={TRIP_FG} />
              <AppText variant="caption" style={{ color: TRIP_FG, fontWeight: '700' }}>{t.city}</AppText>
            </View>
            <Pressable accessibilityRole={t.author.slug ? 'link' : undefined} disabled={!t.author.slug} onPress={() => t.author.slug && router.push({ pathname: '/store/[slug]', params: { slug: t.author.slug } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minHeight: 32 }}>
              <StoreAvatar name={t.author.name} color={t.author.color ?? 'moss'} size={20} path={t.author.avatar_path} />
              <AppText variant="caption" muted numberOfLines={1}>{tr('{name} 整理', { name: t.author.name })}</AppText>
            </Pressable>
            {t.status === 'draft' ? <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('草稿')}</AppText> : null}
          </View>
          <AppText style={{ fontFamily: Fonts?.serif, fontSize: 24, lineHeight: 32, fontWeight: '700', color: c.text }}>{t.title}</AppText>
          {t.intro ? <AppText style={{ lineHeight: 23, color: c.textSecondary }}>{t.intro}</AppText> : null}
        </View>

        <View style={[styles.stats, { backgroundColor: c.surface }]}>
          <Stat n={daysLabel(t.days)} label={tr('天數')} />
          <Stat n={String(t.stop_count)} label={tr('個地點')} />
          <Stat n={String(t.bookstore_count)} label={tr('間書店')} />
          <Stat n={String(t.save_count)} label={tr('人收藏')} />
        </View>

        {dayCount > 1 ? (
          <View style={[styles.seg, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
            {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => {
              const on = Math.min(day, dayCount) === d;
              return (
                <Pressable key={d} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setDay(d)} style={[styles.segItem, on && { backgroundColor: c.surface }]}>
                  <AppText variant="caption" style={{ fontWeight: '700', color: on ? c.text : c.textSecondary }}>{tr('第 {n} 天 · {m} 站', { n: d, m: stops.filter((x) => x.day === d).length })}</AppText>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {shown.length === 0 ? <AppText muted>{tr('這一天還沒有地點。')}</AppText> : null}
        <View>{shown.map((s, i) => <StopRow key={s.id} s={s} i={i} next={shown[i + 1]} />)}</View>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        {t.is_mine ? (
          <BarIcon icon="share" label={tr('分享')} onPress={share} />
        ) : (
          <BarIcon icon="bookmark" label={t.saved ? tr('已收藏') : tr('收藏書旅')} on={t.saved} onPress={() => requireAuth(() => save.mutate({ id: t.id, on: !t.saved }, { onError: fail }))} />
        )}
        <Pressable accessibilityRole="button" onPress={() => openTripMap(shown.length ? shown : stops)} style={[styles.barBtn, { borderColor: c.border, flex: 1 }]}>
          <Feather name="map" size={16} color={c.text} />
          <AppText variant="label">{tr('地圖路線')}</AppText>
        </Pressable>
        {t.is_mine ? (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/trip/edit', params: { id: t.id } })} style={[styles.barBtn, { backgroundColor: c.primary, borderColor: c.primary, flex: 1.3 }]}>
            <Feather name="edit-2" size={16} color={c.onPrimary} />
            <AppText variant="label" style={{ color: c.onPrimary }}>{tr('編輯書旅')}</AppText>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={addAll} style={[styles.barBtn, { backgroundColor: c.primary, borderColor: c.primary, flex: 1.3 }]}>
            <Feather name="plus" size={16} color={c.onPrimary} />
            <AppText variant="label" style={{ color: c.onPrimary }}>{tr('全部加進想去')}</AppText>
          </Pressable>
        )}
      </SafeAreaView>

      <ActionSheet
        visible={menu}
        title={t.title}
        onClose={() => setMenu(false)}
        actions={[
          { label: tr('全部加進想去'), sub: tr('已經在想去的不會重複'), icon: 'bookmark' as const, onPress: addAll },
          { label: tr('分享'), icon: 'share' as const, onPress: share },
          ...(t.is_mine
            ? [{
                label: tr('刪除書旅'),
                destructive: true,
                onPress: () =>
                  Alert.alert(tr('刪除這份書旅？'), tr('收藏的人也會看不到，無法復原。'), [
                    { text: tr('取消'), style: 'cancel' },
                    { text: tr('刪除'), style: 'destructive', onPress: () => del.mutate(t.id, { onSuccess: () => router.back(), onError: fail }) },
                  ]),
              }]
            : []),
        ]}
      />
    </Screen>
  );
}

/** v1.8.1 AJ4：時間軸一站：左邊圖示＋直線，右邊「01 · 早上」、白卡（名稱、類型、推薦）；下面到下一站走路時間 */
function StopRow({ s, i, next }: { s: TripStop; i: number; next?: TripStop }) {
  const c = useTheme();
  const k = stopKind(s.place.category);
  const walk = next ? walkMinutes(s.place, next.place) : null;
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.md, paddingBottom: next ? Spacing.sm : 0 }}>
      <View style={{ width: 36, alignItems: 'center' }}>
        <View style={[styles.icon, { backgroundColor: k.bg, borderColor: c.background }]}>
          <Feather name={k.icon} size={17} color={k.fg} />
        </View>
        {next ? <View style={[styles.line, { backgroundColor: c.border }]} /> : null}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <AppText variant="caption" muted style={{ fontSize: 11.5 }}>{[String(i + 1).padStart(2, '0'), s.slot ? SLOT_LABEL()[s.slot] : null].filter(Boolean).join(' · ')}</AppText>
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/place/[id]', params: { id: s.place.id } })} style={[styles.stop, { backgroundColor: c.surface }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText variant="label" style={{ flex: 1, fontSize: 15 }}>{s.place.name}</AppText>
            <View style={[styles.tag, { backgroundColor: k.bg }]}><AppText variant="caption" style={{ color: k.fg, fontWeight: '700', fontSize: 11 }}>{k.label}</AppText></View>
          </View>
          {s.note ? <AppText style={{ lineHeight: 21, marginTop: 4, fontSize: 14 }}>{s.note}</AppText> : null}
        </Pressable>
        {walk ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 2 }}>
            <Feather name="navigation" size={11} color={c.textTertiary} />
            <AppText variant="caption" style={{ color: c.textTertiary }}>{walkLabel(walk)}</AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <AppText style={{ fontSize: 17, fontWeight: '700' }}>{n}</AppText>
      <AppText variant="caption" muted style={{ fontSize: 11.5 }}>{label}</AppText>
    </View>
  );
}

function BarIcon({ icon, label, on, onPress }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; on?: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={on === undefined ? undefined : { selected: on }} onPress={onPress} style={[styles.barBtn, { width: 50, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.surfaceMuted : 'transparent' }]}>
      <Feather name={on ? 'check' : icon} size={19} color={c.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  city: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  stats: { flexDirection: 'row', borderRadius: Radius.lg, paddingVertical: 10 },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segItem: { flex: 1, minHeight: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  line: { flex: 1, width: 2, marginTop: 2, marginBottom: -Spacing.sm - 16 },
  stop: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  tag: { borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 1 },
  bar: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  barBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, borderRadius: 14, borderWidth: 1, marginBottom: Spacing.sm },
});
