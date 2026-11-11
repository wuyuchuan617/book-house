import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
import { useSavedBooks } from '@/lib/browse';
import { useMyStore } from '@/lib/queries';
import { shareStore } from '@/lib/links';
import { tr } from '@/lib/i18n';

/**
 * G1 我的書店（v1.5）：每個人都有書店。頂部縮小（小頭貼＋店名＋一行數字＋4 顆小按鈕），
 * 下面是策展｜店主閱讀；第一次進來跳出 G0 設定卡。
 */
export default function MyStoreScreen() {
  const c = useTheme();
  const { session, requireAuth } = useAuth();
  const { data, isLoading } = useMyStore();
  const { data: curations } = useMyCurations();
  const readings = useMyReadings();
  const removal = useReadingRemoval();
  const [tab, setTab] = useState<'curation' | 'reading' | 'journal'>('curation');
  const { data: wants } = useSavedBooks();
  const readingCount = (readings.data ?? []).filter((r) => r.id !== removal.pending?.id).length + (wants?.length ?? 0);

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
  const statsLine = [
    tr('{n} 追蹤', { n: stats?.follower_count ?? 0 }),
    tr('本月 {n} 拜訪', { n: stats?.visits_this_month ?? 0 }),
    tr('{n} 檔策展', { n: stats?.published_curation_count ?? 0 }),
  ].join(' · ');

  return (
    <Screen>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={[styles.band, { backgroundColor: StoreColors[store.color].hex }]} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: 96, gap: Spacing.md }} stickyHeaderIndices={[1]}>
          <View style={{ gap: Spacing.md, paddingTop: Spacing.lg }}>
            <View style={styles.head}>
              <StoreAvatar name={store.name} color={store.color} size={48} path={store.avatar_path} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="heading" numberOfLines={1}>{store.name}</AppText>
                <AppText variant="caption" muted numberOfLines={1}>{statsLine}</AppText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={tr('設定')} onPress={() => router.push('/settings')} style={styles.icon}>
                <Feather name="settings" size={20} color={c.text} />
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
              <Pill icon="edit-2" label={tr('編輯')} onPress={() => router.push('/store-edit')} />
              <Pill icon="eye" label={tr('讀者視角')} onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: store.slug } })} />
              <Pill icon="share" label={tr('分享')} onPress={() => shareStore(store.name, store.slug)} />
              <Pill icon="globe" label={tr('公開設定')} onPress={() => router.push('/store-visibility')} />
            </ScrollView>
          </View>

          <View style={{ backgroundColor: c.background, paddingVertical: 4 }}>
            <View style={[styles.segment, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
              {(['curation', 'reading', 'journal'] as const).map((t) => {
                const selected = tab === t;
                return (
                  <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setTab(t)} style={[styles.segmentItem, selected && { backgroundColor: c.surface }]}>
                    <AppText variant="caption" style={{ fontWeight: '700', color: selected ? c.text : c.textSecondary }}>
                      {t === 'curation' ? tr('策展 · {p0}', { p0: curations?.length ?? 0 }) : t === 'reading' ? tr('店主閱讀 · {readingCount}', { readingCount }) : tr('店主手記')}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {tab === 'curation' ? (
            <CurationSection />
          ) : tab === 'reading' ? (
            <ReadingSection readings={readings.data} wants={wants} loading={readings.isLoading} color={store.color} removal={removal} />
          ) : (
            <StoreJournal bookstoreId={store.id} color={store.color} mine />
          )}
        </ScrollView>
        <ReadingRemovalToast removal={removal} />
        <StoreSetupSheet store={store} />
      </SafeAreaView>
    </Screen>
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
  band: { height: 5 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  icon: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill },
  pill: { minHeight: 36, paddingHorizontal: 10, borderRadius: Radius.pill, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  segment: { flexDirection: 'row', borderRadius: Radius.md, padding: 3 },
  segmentItem: { flex: 1, minHeight: MinTouch - 4, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
});
