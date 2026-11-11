import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, NotificationBell } from '@/components/icon-button';
import { OwnerRx } from '@/components/rx-mine';
import { StoreAvatar } from '@/components/social';
import { StoreJournal } from '@/components/store-journal';
import { StoreSetupSheet } from '@/components/store-setup';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing, StoreColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { CurationSection } from '@/components/my-curations';
import { ReadingRemovalToast, ReadingSection, useReadingRemoval } from '@/components/my-readings';
import { useMyCurations } from '@/lib/curations';
import { useMyReadings } from '@/lib/readings';
import { useMyStore } from '@/lib/queries';
import { shareStore } from '@/lib/links';
import { tr } from '@/lib/i18n';
import { useStoreInsights } from '@/lib/store-v16';
import { storageUrl } from '@/lib/uploads';

type Tab = 'curation' | 'reading' | 'journal' | 'rx';

/**
 * W1 我的書店（v1.6）：120px 背景橫幅（右上 數據／通知／設定）、追蹤者／追蹤中點得進去、
 * 分頁 策展｜店主閱讀｜手記｜處方簽；第一次進來跳出 G0 設定卡。
 */
export default function MyStoreScreen() {
  const c = useTheme();
  const { session, requireAuth } = useAuth();
  const { data, isLoading } = useMyStore();
  const { data: curations } = useMyCurations();
  const readings = useMyReadings();
  const removal = useReadingRemoval();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'rx' ? 'rx' : 'curation');
  const insights = useStoreInsights();
  const insets = useSafeAreaInsets();
  const readingCount = (readings.data ?? []).filter((r) => r.id !== removal.pending?.id).length;

  if (!session) {
    return (
      <Screen>
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <AppText variant="title">{tr('我的書店')}</AppText>
          </View>
          <EmptyState title={tr('每個人都有一間小書店')} body={tr('登入後就有你的書店：放推薦的書、正在讀的書。')} actionLabel={tr('登入')} onAction={() => requireAuth(() => undefined)} />
        </SafeAreaView>
      </Screen>
    );
  }

  if (isLoading || !data) {
    return (
      <Screen>
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          {isLoading ? <ActivityIndicator style={{ marginTop: 48 }} /> : <EmptyState title={tr('書店暫時打不開')} body={tr('帳號正在刪除中，或網路有點問題。下拉或稍後再試一次。')} />}
        </SafeAreaView>
      </Screen>
    );
  }

  const { store, stats } = data;
  const banner = storageUrl('banner', store.banner_path);
  const hex = StoreColors[store.color].hex;
  const followers = insights.data?.followers ?? stats?.follower_count ?? 0;
  const following = insights.data?.following ?? 0;
  const TABS: [Tab, string][] = [
    ['curation', tr('策展 · {p0}', { p0: curations?.length ?? 0 })],
    ['reading', tr('店主閱讀 · {readingCount}', { readingCount })],
    ['journal', tr('手記')],
    ['rx', tr('處方簽')],
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 96 }} stickyHeaderIndices={[2]}>
        {/* W1 120px 背景橫幅：沒有圖就用店面顏色 */}
        <View style={[styles.banner, { height: 120 + insets.top, backgroundColor: hex }]}>
          {banner ? (
            <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.shade]} />
          )}
          <View style={[styles.bannerShade]} />
          <View style={[styles.topButtons, { top: insets.top + 10 }]}>
            <IconButton icon="bar-chart-2" label={tr('數據')} onImage onPress={() => router.push('/store-insights')} />
            <NotificationBell onImage />
            <IconButton icon="settings" label={tr('設定')} onImage onPress={() => router.push('/settings')} />
          </View>
          <View style={styles.identity}>
            <View style={[styles.avatarRing, { borderColor: c.background }]}>
              <StoreAvatar name={store.name} color={store.color} size={56} path={store.avatar_path} />
            </View>
            <AppText numberOfLines={1} style={styles.name}>{store.name}</AppText>
          </View>
        </View>

        <View style={{ paddingHorizontal: Spacing.xl, paddingTop: 34, gap: Spacing.md }}>
          {store.tagline ? <AppText variant="caption" muted numberOfLines={2}>{store.tagline}</AppText> : null}
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <CountPill n={followers} label={tr('追蹤者')} onPress={() => router.push({ pathname: '/follows', params: { kind: 'followers' } })} />
            <CountPill n={following} label={tr('追蹤中')} onPress={() => router.push({ pathname: '/follows', params: { kind: 'following' } })} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
            <Pill icon="edit-2" label={tr('編輯')} onPress={() => router.push('/store-edit')} />
            <Pill icon="eye" label={tr('讀者視角')} onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: store.slug } })} />
            <Pill icon="share" label={tr('分享')} onPress={() => shareStore(store.name, store.slug)} />
            <Pill icon="globe" label={tr('公開設定')} onPress={() => router.push('/store-visibility')} />
          </ScrollView>
        </View>

        <View style={{ backgroundColor: c.background, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xl }}>
          <View style={[styles.segment, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
            {TABS.map(([t, label]) => {
              const selected = tab === t;
              return (
                <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setTab(t)} style={[styles.segmentItem, selected && { backgroundColor: c.surface }]}>
                  <AppText variant="caption" numberOfLines={1} style={{ fontWeight: '700', color: selected ? c.text : c.textSecondary }}>{label}</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm }}>
          {tab === 'curation' ? (
            <CurationSection />
          ) : tab === 'reading' ? (
            <ReadingSection readings={readings.data} loading={readings.isLoading} color={store.color} removal={removal} />
          ) : tab === 'journal' ? (
            <StoreJournal bookstoreId={store.id} color={store.color} mine />
          ) : (
            <OwnerRx />
          )}
        </View>
      </ScrollView>
      <ReadingRemovalToast removal={removal} />
      <StoreSetupSheet store={store} />
    </Screen>
  );
}

/** 追蹤者／追蹤中：淺底＋箭頭，看得出能點 */
function CountPill({ n, label, onPress }: { n: number; label: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${n} ${label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.count, { backgroundColor: c.surfaceMuted, opacity: pressed ? 0.8 : 1 }]}>
      <AppText style={{ fontWeight: '700', fontSize: 15 }}>{String(n)}</AppText>
      <AppText variant="caption">{label}</AppText>
      <Feather name="chevron-right" size={14} color={c.textSecondary} />
    </Pressable>
  );
}

/** 頂部的小按鈕：編輯、讀者視角、分享、公開設定 */
function Pill({ icon, label, onPress }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.pill, { borderColor: c.border, backgroundColor: c.surface, opacity: pressed ? 0.8 : 1 }]}>
      <Feather name={icon} size={14} color={c.text} />
      <AppText variant="caption" style={{ fontWeight: '700' }}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titleRow: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg },
  banner: { position: 'relative', zIndex: 2 },
  shade: { backgroundColor: 'rgba(0,0,0,0.12)' },
  bannerShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 60, backgroundColor: 'rgba(0,0,0,0.18)' },
  topButtons: { position: 'absolute', right: 12, flexDirection: 'row', gap: 8 },
  identity: { position: 'absolute', left: Spacing.xl, right: Spacing.xl, bottom: -24, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  avatarRing: { borderWidth: 3, borderRadius: 18 },
  name: { flex: 1, color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginBottom: 30, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 34, paddingLeft: 12, paddingRight: 8, borderRadius: Radius.pill },
  pill: { minHeight: 36, paddingHorizontal: 10, borderRadius: Radius.pill, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  segment: { flexDirection: 'row', borderRadius: Radius.md, padding: 3 },
  segmentItem: { flex: 1, minHeight: MinTouch - 4, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
});
