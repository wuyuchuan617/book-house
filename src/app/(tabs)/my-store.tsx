import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing, StoreColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { CurationSection } from '@/components/my-curations';
import { ReadingRemovalToast, ReadingSection, useReadingRemoval } from '@/components/my-readings';
import { useMyCurations } from '@/lib/curations';
import { useMyReadings } from '@/lib/readings';
import { useSavedBooks } from '@/lib/browse';
import { useMyStore } from '@/lib/queries';
import { storeLinkLabel } from '@/lib/links';

/** 未開店 → O1 入口；已開店 → M1 我的書店（策展列表）。TODO(M4)：店主閱讀分頁 R1–R7、M2 編輯書店 */
export default function MyStoreScreen() {
  const c = useTheme();
  const { session, requireAuth } = useAuth();
  const { data, isLoading } = useMyStore();
  const { data: curations } = useMyCurations();
  const readings = useMyReadings();
  const removal = useReadingRemoval();
  const [tab, setTab] = useState<'curation' | 'reading'>('curation');
  const { data: wants } = useSavedBooks();
  const readingCount = (readings.data ?? []).filter((r) => r.id !== removal.pending?.id).length + (wants?.length ?? 0);

  return (
    <Screen>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={styles.header}>
          <AppText variant="title">我的書店</AppText>
          {session ? (
            <Pressable accessibilityRole="button" accessibilityLabel="設定" onPress={() => router.push('/settings')} style={styles.icon}>
              <Feather name="settings" size={20} color={c.text} />
            </Pressable>
          ) : null}
        </View>

        {!session ? (
          <EmptyState title="開一間只屬於你的書店" body="登入後就能開店，三個步驟、大約 3 分鐘。" actionLabel="登入" onAction={() => requireAuth(() => router.push('/open-store'))} />
        ) : isLoading ? (
          <ActivityIndicator style={{ marginTop: 48 }} />
        ) : !data ? (
          <OpenStoreIntro />
        ) : (
          <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md }}>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <View style={{ height: 64, backgroundColor: StoreColors[data.store.color].hex }} />
              <View style={{ padding: Spacing.lg }}>
                <AppText variant="heading">{data.store.name}</AppText>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <AppText variant="caption" muted style={{ flex: 1 }}>{storeLinkLabel(data.store.slug)}</AppText>
                  <Button kind="secondary" label="編輯書店" style={{ minHeight: MinTouch - 4 }} onPress={() => router.push('/store-edit')} />
                </View>
                <Button kind="link" label="讀者視角" style={{ minHeight: MinTouch, alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: data.store.slug } })} />
                <View style={[styles.stats, { borderTopColor: c.divider }]}>
                  <Stat label="追蹤" value={data.stats?.follower_count ?? 0} />
                  <Stat label="本月拜訪" value={data.stats?.visits_this_month ?? 0} />
                  <Stat label="檔策展" value={data.stats?.published_curation_count ?? 0} />
                </View>
              </View>
            </Card>
            <View style={[styles.segment, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
              {(['curation', 'reading'] as const).map((t) => {
                const selected = tab === t;
                return (
                  <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setTab(t)} style={[styles.segmentItem, selected && { backgroundColor: c.surface }]}>
                    <AppText variant="caption" style={{ fontWeight: '700', color: selected ? c.text : c.textSecondary }}>
                      {t === 'curation' ? `策展 · ${curations?.length ?? 0}` : `店主閱讀 · ${readingCount}`}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            {tab === 'curation' ? (
              <CurationSection />
            ) : (
              <ReadingSection readings={readings.data} wants={wants} loading={readings.isLoading} color={data.store.color} removal={removal} />
            )}
          </ScrollView>
        )}
        <ReadingRemovalToast removal={removal} />
      </SafeAreaView>
    </Screen>
  );
}

function OpenStoreIntro() {
  const steps = [
    ['取店名、選店面顏色', '完成這步，書店就開張了'],
    ['想好這個月的策展主題', '有範本可以挑 · 可略過'],
    ['放上第一本書', '1 本就能發布 · 可略過'],
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }}>
      <AppText variant="heading">開一間只屬於你的書店</AppText>
      <AppText muted>三個步驟、大約 3 分鐘。除了店名，其他都能之後再補。</AppText>
      {steps.map(([t, s], i) => (
        <View key={t} style={{ flexDirection: 'row', gap: Spacing.md }}>
          <AppText variant="label">{i + 1}</AppText>
          <View>
            <AppText variant="label">{t}</AppText>
            <AppText variant="caption" muted>{s}</AppText>
          </View>
        </View>
      ))}
      <Button label="開始開店" onPress={() => router.push('/open-store')} />
      <Button kind="link" label="先看看別人的書店" onPress={() => router.navigate('/')} />
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <AppText style={{ fontSize: 17, fontWeight: '700' }}>{String(value)}</AppText>
      <AppText variant="caption" muted>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icon: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill },
  stats: { flexDirection: 'row', marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1 },
  segment: { flexDirection: 'row', borderRadius: Radius.md, padding: 3, marginTop: Spacing.sm },
  segmentItem: { flex: 1, minHeight: MinTouch - 4, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
});
