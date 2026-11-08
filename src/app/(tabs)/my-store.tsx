import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Image } from 'expo-image';

import { StoreAvatar } from '@/components/social';
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
import { shareStore, storeLinkLabel } from '@/lib/links';
import { storageUrl } from '@/lib/uploads';
import { tr } from '@/lib/i18n';

/** 未開店 → O1 入口；已開店 → M1 我的書店（策展列表）。書店卡片：背景圖、頭貼、編輯／讀者視角／分享 */
export default function MyStoreScreen() {
  const c = useTheme();
  const { session, requireAuth } = useAuth();
  const { data, isLoading } = useMyStore();
  const { data: curations } = useMyCurations();
  const readings = useMyReadings();
  const removal = useReadingRemoval();
  const [tab, setTab] = useState<'curation' | 'reading'>('curation');
  const { data: wants } = useSavedBooks();
  const banner = storageUrl('banner', data?.store.banner_path);
  const readingCount = (readings.data ?? []).filter((r) => r.id !== removal.pending?.id).length + (wants?.length ?? 0);

  return (
    <Screen>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={styles.header}>
          <AppText variant="title">{tr('我的書店')}</AppText>
          {session ? (
            <Pressable accessibilityRole="button" accessibilityLabel={tr('設定')} onPress={() => router.push('/settings')} style={styles.icon}>
              <Feather name="settings" size={20} color={c.text} />
            </Pressable>
          ) : null}
        </View>

        {!session ? (
          <EmptyState title={tr('開一間只屬於你的書店')} body={tr('登入後就能開店，三個步驟、大約 3 分鐘。')} actionLabel={tr('登入')} onAction={() => requireAuth(() => router.push('/open-store'))} />
        ) : isLoading ? (
          <ActivityIndicator style={{ marginTop: 48 }} />
        ) : !data ? (
          <OpenStoreIntro />
        ) : (
          <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md }}>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <View style={[styles.banner, { backgroundColor: StoreColors[data.store.color].hex }]}>
                {banner ? <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
              </View>
              <View style={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg }}>
                <View style={[styles.avatarRing, { backgroundColor: c.surface }]}>
                  <StoreAvatar name={data.store.name} color={data.store.color} size={64} path={data.store.avatar_path} />
                </View>
                <AppText variant="heading" style={{ marginTop: Spacing.sm }}>{data.store.name}</AppText>
                {data.store.tagline ? <AppText variant="caption" muted style={{ marginTop: 2 }}>{data.store.tagline}</AppText> : null}
                <AppText variant="caption" muted style={{ marginTop: 2 }}>{storeLinkLabel(data.store.slug)}</AppText>
                <View style={styles.actions}>
                  <ActionButton icon="edit-2" label={tr('編輯')} onPress={() => router.push('/store-edit')} />
                  <ActionButton icon="eye" label={tr('讀者視角')} onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: data.store.slug } })} />
                  <ActionButton icon="share" label={tr('分享')} onPress={() => shareStore(data.store.name, data.store.slug)} />
                </View>
                <View style={[styles.stats, { borderTopColor: c.divider }]}>
                  <Stat label={tr('追蹤')} value={data.stats?.follower_count ?? 0} />
                  <Stat label={tr('本月拜訪')} value={data.stats?.visits_this_month ?? 0} />
                  <Stat label={tr('檔策展')} value={data.stats?.published_curation_count ?? 0} />
                </View>
              </View>
            </Card>
            <View style={[styles.segment, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
              {(['curation', 'reading'] as const).map((t) => {
                const selected = tab === t;
                return (
                  <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setTab(t)} style={[styles.segmentItem, selected && { backgroundColor: c.surface }]}>
                    <AppText variant="caption" style={{ fontWeight: '700', color: selected ? c.text : c.textSecondary }}>
                      {t === 'curation' ? tr('策展 · {p0}', { p0: curations?.length ?? 0 }) : tr('店主閱讀 · {readingCount}', { readingCount })}
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
    [tr('取店名、選店面顏色'), tr('完成這步，書店就開張了')],
    [tr('想好這個月的策展主題'), tr('有範本可以挑 · 可略過')],
    [tr('放上第一本書'), tr('1 本就能發布 · 可略過')],
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }}>
      <AppText variant="heading">{tr('開一間只屬於你的書店')}</AppText>
      <AppText muted>{tr('三個步驟、大約 3 分鐘。除了店名，其他都能之後再補。')}</AppText>
      {steps.map(([t, s], i) => (
        <View key={t} style={{ flexDirection: 'row', gap: Spacing.md }}>
          <AppText variant="label">{i + 1}</AppText>
          <View>
            <AppText variant="label">{t}</AppText>
            <AppText variant="caption" muted>{s}</AppText>
          </View>
        </View>
      ))}
      <Button label={tr('開始開店')} onPress={() => router.push('/open-store')} />
      <Button kind="link" label={tr('先看看別人的書店')} onPress={() => router.navigate('/')} />
    </ScrollView>
  );
}

/** 書店卡片上的三個動作：編輯、讀者視角、分享（同樣大小，一眼看得到） */
function ActionButton({ icon, label, onPress }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.action, { borderColor: c.border, backgroundColor: c.surface, opacity: pressed ? 0.8 : 1 }]}>
      <Feather name={icon} size={18} color={c.text} />
      <AppText variant="caption" style={{ fontWeight: '700' }} numberOfLines={1} adjustsFontSizeToFit>{label}</AppText>
    </Pressable>
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
  banner: { height: 96 },
  avatarRing: { marginTop: -32, alignSelf: 'flex-start', padding: 3, borderRadius: 22 },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  action: { flex: 1, minHeight: 60, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 4, paddingVertical: Spacing.sm },
  stats: { flexDirection: 'row', marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1 },
  segment: { flexDirection: 'row', borderRadius: Radius.md, padding: 3, marginTop: Spacing.sm },
  segmentItem: { flex: 1, minHeight: MinTouch - 4, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
});
