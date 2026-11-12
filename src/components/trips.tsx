import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AboutLink } from '@/components/about';
import { Chip } from '@/components/form';
import { StoreAvatar } from '@/components/social';
import { AppText, Card, EmptyState } from '@/components/ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { tr } from '@/lib/i18n';
import { daysLabel, stopKind, useExploreTrips, useTripCities, type Trip } from '@/lib/trips';

export const openTrip = (id: string) => router.push({ pathname: '/trip/[id]', params: { id } });

/** v1.8.1 AJ3 書旅卡片：白卡；城市＋天數、深色襯線標題、一排站點圖示預覽路線、前幾站名稱；最下面作者與收藏數 */
export function TripCard({ t }: { t: Trip }) {
  const c = useTheme();
  const route = t.preview ?? (t.stops ?? []).slice(0, 5).map((x) => ({ name: x.place.name, category: x.place.category }));
  const more = Math.max(0, t.stop_count - route.length);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${t.title}，${t.city}，${tr('{n} 個地點', { n: t.stop_count })}`} onPress={() => openTrip(t.id)}>
      <Card style={{ gap: Spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.city, { backgroundColor: TRIP_BG }]}>
            <Feather name="map" size={11} color={TRIP_FG} />
            <AppText variant="caption" style={{ color: TRIP_FG, fontWeight: '700', fontSize: 12 }}>{t.city}</AppText>
          </View>
          <AppText variant="caption" muted style={{ flex: 1 }}>{daysLabel(t.days)}</AppText>
          {t.status === 'draft' ? <View style={[styles.city, { backgroundColor: c.surfaceMuted }]}><AppText variant="caption" style={{ fontWeight: '700', fontSize: 12 }}>{tr('草稿')}</AppText></View> : null}
        </View>
        <AppText style={{ fontFamily: Fonts?.serif, fontSize: 18, fontWeight: '700', lineHeight: 25, color: c.text }} numberOfLines={2}>{t.title}</AppText>
        {route.length ? (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {route.map((r, i) => (
                <View key={`${r.name}-${i}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {i ? <View style={[styles.link, { backgroundColor: c.border }]} /> : null}
                  <View style={[styles.stop, { backgroundColor: i === 0 ? TRIP_FG : stopKind(r.category).bg }]}>
                    <Feather name={stopKind(r.category).icon} size={13} color={i === 0 ? '#FFFFFF' : stopKind(r.category).fg} />
                  </View>
                </View>
              ))}
              {more ? <AppText variant="caption" muted style={{ marginLeft: 6 }}>{`+${more}`}</AppText> : null}
            </View>
            <AppText variant="caption" muted numberOfLines={1}>{route.slice(0, 3).map((r) => r.name).join(' → ')}</AppText>
          </View>
        ) : null}
        <View style={[styles.foot, { borderTopColor: c.divider }]}>
          <StoreAvatar name={t.author.name} color={t.author.color ?? 'moss'} size={20} path={t.author.avatar_path} />
          <AppText variant="caption" numberOfLines={1} style={{ flex: 1, fontWeight: '600' }}>{t.author.name}</AppText>
          <AppText variant="caption" muted>{[tr('{n} 個地點', { n: t.stop_count }), t.save_count ? tr('{n} 人收藏', { n: t.save_count }) : null].filter(Boolean).join(' · ')}</AppText>
        </View>
      </Card>
    </Pressable>
  );
}

export const TRIP_FG = '#2E5A87';
export const TRIP_BG = '#E4ECF5';

/** 探索 › 書旅：先選城市（有書旅的城市，依數量），列出大家公開的書旅 */
export function TripsExplore() {
  const { requireAuth } = useAuth();
  const cities = useTripCities();
  const [city, setCity] = useState<string | null>(null);
  const list = useExploreTrips(city);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flex: 1 }} contentContainerStyle={{ gap: Spacing.sm }}>
          <Chip label={tr('全部城市')} selected={!city} onPress={() => setCity(null)} />
          {(cities.data ?? []).map((x) => <Chip key={x.city} label={`${x.city} · ${x.n}`} selected={city === x.city} onPress={() => setCity(x.city)} />)}
        </ScrollView>
        <AboutLink feature="trip" />
      </View>
      {list.isPending ? (
        <ActivityIndicator style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={list.data ?? []}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md, flexGrow: 1, paddingBottom: 96 }}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
          ListEmptyComponent={
            <EmptyState
              title={city ? tr('{city}還沒有書旅', { city }) : tr('還沒有人分享書旅')}
              body={tr('出去玩時常去的書店、順路的咖啡，整理一份給要去的人參考。')}
              actionLabel={tr('整理一份書旅')}
              onAction={() => requireAuth(() => router.push('/trip/edit'))}
            />
          }
          renderItem={({ item }) => <TripCard t={item} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  city: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  stop: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  link: { width: 14, height: 2, borderRadius: 1 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.sm, marginTop: 2 },
});
