import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { CheckinCard } from '@/components/diary';
import { ActionSheet } from '@/components/sheet';
import { AppText, Card, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { categoryIcon, categoryLabel, diaryError, useAdminCategory, PLACE_CATEGORIES, usePlaceDetail, useReportCheckin, type PublicCheckin } from '@/lib/diary';
import { useIsAdmin } from '@/lib/admin';
import { tr } from '@/lib/i18n';
import { openMap, openMapByPref, setMapsPref } from '@/lib/maps';
import { usePlacePurchaseCount } from '@/lib/store-v16';
import { REPORT_REASONS } from '@/lib/safety';

/**
 * L1 地點頁（v1.7.1 Z3 重新設計）：上面是類型、名稱、地址（點了開地圖）；三格數字（打卡／想去／買過）；
 * 一排動作：想去、地圖（iOS 第一次問 Apple／Google，記住）、打卡；我的（想去原因、來過幾次）；
 * 在這裡讀過的書、大家的貼文（可檢舉）。管理員的「修正類型」收進右上 ⋯。
 */
export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const { session, requireAuth } = useAuth();
  const { data, isLoading, refetch, isRefetching } = usePlaceDetail(id);
  const adminCategory = useAdminCategory();
  const { data: isAdmin } = useIsAdmin();
  const report = useReportCheckin();
  const [menuFor, setMenuFor] = useState<PublicCheckin | null>(null);
  const [reportFor, setReportFor] = useState<PublicCheckin | null>(null);
  const [mapAsk, setMapAsk] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const { data: purchaseCount } = usePlacePurchaseCount(id);

  useEffect(() => {
    if (id) track('place_opened', {});
  }, [id]);

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!data) return <EmptyState title={tr('找不到這個地點')} body={tr('它可能已經被移除了。')} />;
  const { place } = data;
  const bought = purchaseCount ?? 0;

  const fail = (e: Error) => Alert.alert(tr('沒有成功'), diaryError(e.message));
  // 想去：開寫日記頁的「想去」（已存過就是編輯，可以移除）
  const openSave = () =>
    requireAuth(() =>
      router.push({
        pathname: '/diary/compose',
        params: {
          kind: 'want',
          placeId: place.id,
          placeName: place.name,
          googlePlaceId: place.google_place_id,
          publicOk: place.public_ok ? '1' : '0',
          ...(data.my_type ? { type: data.my_type } : {}),
          ...(data.saved ? { saved: '1', note: data.my_note ?? '' } : {}),
        },
      }),
    );
  const checkinHere = () =>
    requireAuth(() =>
      router.push({
        pathname: '/diary/compose',
        params: { kind: 'checkin', placeId: place.id, placeName: place.name, googlePlaceId: place.google_place_id, publicOk: place.public_ok ? '1' : '0', category: place.category },
      }),
    );

  const target = { name: place.name, address: place.address, googlePlaceId: place.google_place_id };
  const openMaps = () => {
    if (!openMapByPref(target)) setMapAsk(true);
  };
  const typeLabel = categoryLabel(place.category, data.is_indie);
  const mine = session && (data.saved || data.my_checkins > 0);

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: '',
          headerRight: isAdmin
            ? () => (
                <Pressable accessibilityRole="button" accessibilityLabel={tr('更多操作')} onPress={() => setAdminOpen(true)} style={{ padding: 8 }}>
                  <Feather name="more-horizontal" size={22} color={c.text} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.lg, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}>
        <View style={{ gap: Spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <View style={[styles.icon, { backgroundColor: c.surfaceMuted }]}>
              <Feather name={categoryIcon(place.category)} size={18} color={c.primary} />
            </View>
            {typeLabel ? <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{typeLabel}</AppText> : null}
          </View>
          <AppText variant="title" style={{ fontSize: 26, lineHeight: 34 }}>{place.name}</AppText>
          {place.address ? (
            <Pressable accessibilityRole="link" accessibilityHint={tr('用地圖打開')} onPress={openMaps} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Feather name="map-pin" size={13} color={c.textSecondary} />
              <AppText variant="caption" muted style={{ flexShrink: 1 }}>{place.address}</AppText>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.stats, { backgroundColor: c.surface }]}>
          <Stat value={data.checkin_count} label={tr('公開打卡')} />
          <View style={[styles.statLine, { backgroundColor: c.divider }]} />
          <Stat value={data.save_count} label={tr('人想去')} />
          <View style={[styles.statLine, { backgroundColor: c.divider }]} />
          <Stat value={bought} label={tr('本在這裡買')} />
        </View>

        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: data.saved }}
            onPress={openSave}
            style={[styles.action, { backgroundColor: c.surface, borderColor: data.saved ? c.primary : c.border }]}>
            <Feather name="bookmark" size={16} color={c.primary} />
            <AppText variant="label" style={{ color: data.saved ? c.primary : c.text }}>{data.saved ? tr('已想去') : tr('想去')}</AppText>
          </Pressable>
          <Pressable accessibilityRole="link" accessibilityLabel={tr('用地圖打開')} onPress={openMaps} style={[styles.action, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Feather name="map" size={16} color={c.text} />
            <AppText variant="label">{tr('地圖')}</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={checkinHere} style={[styles.action, { backgroundColor: c.primary, borderColor: c.primary }]}>
            <Feather name="map-pin" size={16} color={c.onPrimary} />
            <AppText variant="label" style={{ color: c.onPrimary }}>{tr('打卡')}</AppText>
          </Pressable>
        </View>

        {mine ? (
          <View style={[styles.mine, { backgroundColor: c.surface }]}>
            {data.saved ? (
              <Pressable accessibilityRole="button" onPress={openSave} style={[styles.mineRow, data.my_checkins > 0 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider }]}>
                <Feather name="bookmark" size={15} color={c.primary} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="caption" muted>{tr('你想去的原因')}</AppText>
                  <AppText style={{ lineHeight: 21 }}>{data.my_note || tr('還沒寫，點這裡補上')}</AppText>
                </View>
                <Feather name="chevron-right" size={16} color={c.textTertiary} />
              </Pressable>
            ) : null}
            {data.my_checkins > 0 ? (
              <View style={styles.mineRow}>
                <Feather name="check-circle" size={15} color={c.success} />
                <AppText style={{ flex: 1 }}>{tr('你來過 {n} 次', { n: data.my_checkins })}</AppText>
              </View>
            ) : null}
          </View>
        ) : null}

        {data.books.length ? (
          <View style={{ gap: Spacing.sm }}>
            <AppText variant="heading">{tr('在這裡讀過的書')}</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.md }}>
              {data.books.map((b) => (
                <Pressable key={b.id} accessibilityRole="link" accessibilityLabel={b.title} onPress={() => router.push({ pathname: '/book/[id]', params: { id: b.id } })} style={{ width: 76, gap: 4 }}>
                  <BookCover title={b.title} url={b.cover_url} color="moss" size="md" />
                  <AppText variant="caption" numberOfLines={2}>{b.title}</AppText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={{ gap: Spacing.sm }}>
          <AppText variant="heading">{tr('大家的貼文')}</AppText>
          {data.checkins.length ? (
            data.checkins.map((ch) => <CheckinCard key={ch.id} checkin={ch} onMore={session ? () => setMenuFor(ch) : undefined} />)
          ) : (
            <Card style={{ alignItems: 'center', gap: 6, paddingVertical: Spacing.xl }}>
              <AppText variant="label">{tr('還沒有公開的貼文')}</AppText>
              <AppText variant="caption" muted style={{ textAlign: 'center' }}>{tr('來這裡讀書時寫一則日記、加上這個地點並設成公開，就會出現在這裡。')}</AppText>
            </Card>
          )}
        </View>
        <AppText variant="caption" style={{ color: c.textTertiary, textAlign: 'center' }}>{tr('地點資料來自 Google')}</AppText>
      </ScrollView>

      <ActionSheet
        visible={mapAsk}
        title={tr('用哪個地圖打開？')}
        subtitle={tr('選過會記住，設定裡可以改')}
        onClose={() => setMapAsk(false)}
        actions={[
          { label: tr('Apple 地圖'), icon: 'map' as const, onPress: () => { setMapsPref('apple'); openMap('apple', target); } },
          { label: tr('Google 地圖'), sub: tr('沒裝 App 會用瀏覽器打開'), icon: 'external-link' as const, onPress: () => { setMapsPref('google'); openMap('google', target); } },
        ]}
      />
      <ActionSheet
        visible={adminOpen}
        title={tr('修正類型（管理員）')}
        subtitle={tr('一般使用者看不到這個選單')}
        onClose={() => setAdminOpen(false)}
        actions={[
          ...PLACE_CATEGORIES.map((t) => ({
            label: categoryLabel(t),
            sub: data.category_override === t ? tr('目前') : undefined,
            icon: categoryIcon(t),
            onPress: () => adminCategory.mutate({ placeId: place.id, value: t }, { onError: fail }),
          })),
          { label: tr('交給使用者選'), sub: !data.category_override ? tr('目前') : undefined, icon: 'users' as const, onPress: () => adminCategory.mutate({ placeId: place.id, value: null }, { onError: fail }) },
        ]}
      />
      <ActionSheet
        visible={!!menuFor}
        onClose={() => setMenuFor(null)}
        actions={[
          {
            label: tr('檢舉這則貼文'),
            icon: 'flag' as const,
            destructive: true,
            onPress: () => {
              const target = menuFor;
              setMenuFor(null);
              setReportFor(target);
            },
          },
        ]}
      />
      <ActionSheet
        visible={!!reportFor}
        title={tr('檢舉原因')}
        onClose={() => setReportFor(null)}
        actions={REPORT_REASONS.map((r) => ({
          label: r.label,
          sub: r.sub,
          onPress: () => {
            const target = reportFor;
            setReportFor(null);
            if (!target) return;
            report.mutate(
              { entryId: target.id, reason: r.value },
              {
                onSuccess: () => Alert.alert(tr('已送出檢舉'), tr('謝謝你，我們會盡快處理。')),
                onError: (e) => Alert.alert(tr('沒有送出'), diaryError(e.message)),
              },
            );
          },
        }))}
      />
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }} accessible accessibilityLabel={`${value} ${label}`}>
      <AppText style={{ fontSize: 20, fontWeight: '700' }}>{String(value)}</AppText>
      <AppText variant="caption" muted>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, paddingVertical: Spacing.md },
  statLine: { width: StyleSheet.hairlineWidth, height: 28 },
  mine: { borderRadius: Radius.lg, overflow: 'hidden' },
  mineRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, minHeight: 52 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, minHeight: MinTouch + 4 },
});
