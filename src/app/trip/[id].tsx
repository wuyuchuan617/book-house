import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/form';
import { ActionSheet } from '@/components/sheet';
import { StoreAvatar } from '@/components/social';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { tr } from '@/lib/i18n';
import { daysLabel, openTripMap, SLOT_LABEL, stopKind, tripError, useDeleteTrip, useSaveTripPlaces, useTripDetail, useTripSave, walkLabel, walkMinutes, type TripStop } from '@/lib/trips';

/** AG2 書旅單頁：城市、作者、天數；收藏／地圖看全部；分天的地點（每站一句推薦、相鄰兩站走路時間） */
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
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.md, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <View style={[styles.city, { backgroundColor: c.surfaceMuted }]}><AppText variant="caption" style={{ fontWeight: '700' }}>{t.city}</AppText></View>
          <Pressable accessibilityRole={t.author.slug ? 'link' : undefined} disabled={!t.author.slug} onPress={() => t.author.slug && router.push({ pathname: '/store/[slug]', params: { slug: t.author.slug } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
            <StoreAvatar name={t.author.name} color={t.author.color ?? 'moss'} size={20} path={t.author.avatar_path} />
            <AppText variant="caption" muted numberOfLines={1}>{`${t.author.name} · ${daysLabel(t.days)}`}</AppText>
          </Pressable>
          {t.status === 'draft' ? <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('草稿')}</AppText> : null}
        </View>
        <AppText variant="title" style={{ fontSize: 23, lineHeight: 31 }}>{t.title}</AppText>
        {t.intro ? <AppText style={{ lineHeight: 23 }}>{t.intro}</AppText> : null}

        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          {!t.is_mine ? (
            <Action icon={t.saved ? 'check' : 'bookmark'} label={t.saved ? tr('已收藏') : tr('收藏書旅')} on={t.saved} onPress={() => requireAuth(() => save.mutate({ id: t.id, on: !t.saved }, { onError: fail }))} />
          ) : (
            <Action icon="edit-2" label={tr('編輯')} onPress={() => router.push({ pathname: '/trip/edit', params: { id: t.id } })} />
          )}
          <Action icon="map" label={tr('地圖看全部')} onPress={() => openTripMap(shown.length ? shown : stops)} />
        </View>

        {dayCount > 1 ? (
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => <Chip key={d} label={tr('第 {n} 天', { n: d })} selected={Math.min(day, dayCount) === d} onPress={() => setDay(d)} />)}
          </View>
        ) : null}

        {shown.length === 0 ? <AppText muted>{tr('這一天還沒有地點。')}</AppText> : null}
        {shown.map((s, i) => <StopRow key={s.id} s={s} i={i} prev={shown[i - 1]} />)}
      </ScrollView>

      <ActionSheet
        visible={menu}
        title={t.title}
        onClose={() => setMenu(false)}
        actions={[
          { label: tr('全部加進想去'), sub: tr('已經在想去的不會重複'), icon: 'bookmark' as const, onPress: addAll },
          { label: tr('分享'), icon: 'share' as const, onPress: () => void Share.share({ message: `${t.title}（${t.city}）\n${stops.map((s, i) => `${i + 1}. ${s.place.name}`).join('\n')}` }) },
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

function StopRow({ s, i, prev }: { s: TripStop; i: number; prev?: TripStop }) {
  const c = useTheme();
  const k = stopKind(s.place.category);
  const walk = prev ? walkMinutes(prev.place, s.place) : null;
  return (
    <View style={{ gap: 6 }}>
      {walk ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 46 }}>
          <Feather name="navigation" size={11} color={c.textTertiary} />
          <AppText variant="caption" style={{ color: c.textTertiary }}>{walkLabel(walk)}</AppText>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' }}>
        <View style={[styles.icon, { backgroundColor: k.bg }]}>
          <Feather name={k.icon} size={17} color={k.fg} />
          <View style={[styles.num, { backgroundColor: c.text }]}><AppText style={{ color: c.background, fontSize: 10, fontWeight: '700' }}>{String(i + 1)}</AppText></View>
        </View>
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/place/[id]', params: { id: s.place.id } })} style={[styles.stop, { backgroundColor: c.surface }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText variant="label" style={{ flex: 1 }}>{s.place.name}</AppText>
            <AppText variant="caption" muted>{[k.label, s.slot ? SLOT_LABEL()[s.slot] : null].filter(Boolean).join(' · ')}</AppText>
          </View>
          {s.note ? <AppText style={{ lineHeight: 21, marginTop: 2 }}>{s.note}</AppText> : null}
        </Pressable>
      </View>
    </View>
  );
}

function Action({ icon, label, on, onPress }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; on?: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={on === undefined ? undefined : { selected: on }} onPress={onPress} style={[styles.action, { backgroundColor: c.surface, borderColor: on ? c.primary : c.border }]}>
      <Feather name={icon} size={16} color={on ? c.primary : c.text} />
      <AppText variant="label" style={{ color: on ? c.primary : c.text }}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  city: { borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 2 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: Radius.md, minHeight: MinTouch + 2 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  num: { position: 'absolute', top: -4, left: -4, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stop: { flex: 1, borderRadius: Radius.lg, padding: Spacing.md },
});
