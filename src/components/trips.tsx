import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AboutLink } from '@/components/about';
import { Chip } from '@/components/form';
import { StoreAvatar } from '@/components/social';
import { AppText, Card, EmptyState } from '@/components/ui';
import { Radius, Spacing, StoreColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { tr } from '@/lib/i18n';
import { daysLabel, useExploreTrips, useTripCities, type Trip } from '@/lib/trips';

export const openTrip = (id: string) => router.push({ pathname: '/trip/[id]', params: { id } });

/** AG1 書旅卡片：上面色帶＋城市標籤，下面標題、誰、幾個地點、幾人收藏 */
export function TripCard({ t }: { t: Trip }) {
  const c = useTheme();
  const hex = StoreColors[t.author.color ?? 'moss']?.hex ?? c.primary;
  return (
    <Pressable accessibilityRole="link" onPress={() => openTrip(t.id)}>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={[styles.band, { backgroundColor: hex }]}>
          <View style={styles.city}><AppText variant="caption" style={{ fontWeight: '700' }}>{t.city}</AppText></View>
          {t.status === 'draft' ? <View style={[styles.city, { backgroundColor: 'rgba(0,0,0,0.35)' }]}><AppText variant="caption" style={{ color: '#FFFFFF', fontWeight: '700' }}>{tr('草稿')}</AppText></View> : null}
        </View>
        <View style={{ padding: Spacing.md, gap: 4 }}>
          <AppText variant="label" style={{ fontSize: 16 }}>{t.title}</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <StoreAvatar name={t.author.name} color={t.author.color ?? 'moss'} size={18} path={t.author.avatar_path} />
            <AppText variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
              {[t.author.name, daysLabel(t.days), tr('{n} 個地點', { n: t.stop_count }), t.save_count ? tr('{n} 人收藏', { n: t.save_count }) : null].filter(Boolean).join(' · ')}
            </AppText>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

/** 探索 › 書旅：先選城市（有書旅的城市，依數量），列出大家公開的書旅 */
export function TripsExplore() {
  const c = useTheme();
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
      </View>
      {list.isPending ? (
        <ActivityIndicator style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={list.data ?? []}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.md, flexGrow: 1, paddingBottom: 96 }}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
          ListHeaderComponent={
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable accessibilityRole="button" onPress={() => requireAuth(() => router.push('/trip/edit'))} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Feather name="plus" size={14} color={c.primary} />
                <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('整理一份書旅')}</AppText>
              </Pressable>
              <AboutLink feature="trip" />
            </View>
          }
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
  band: { height: 72, flexDirection: 'row', alignItems: 'flex-end', gap: 6, padding: Spacing.sm },
  city: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 2 },
});
