import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { CurationView } from '@/components/curation-view';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { Radius, Spacing, StoreColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCuration } from '@/lib/curations';
import { monthOf } from '@/lib/period';
import { useMyStore } from '@/lib/queries';
import { tr } from '@/lib/i18n';

/** C7「以讀者身分預覽」：草稿也能看，畫面跟 A3 書店頁一樣 */
export default function CurationPreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const { data: cur, isLoading } = useCuration(id);
  const { data: store } = useMyStore();

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!cur || !store) return <EmptyState title={tr('找不到這檔策展')} body={tr('它可能已經被刪除了。')} />;

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('讀者看到的樣子') }} />
      <ScrollView>
        {cur.status !== 'published' ? (
          <View style={[styles.note, { backgroundColor: c.surfaceMuted }]}>
            <AppText variant="caption">{cur.status === 'scheduled' ? tr('預約中 · {p0}/1 上架後讀者才看得到', { p0: monthOf(cur.period) }) : tr('草稿 · 發布後讀者才看得到')}</AppText>
          </View>
        ) : null}
        <View style={[styles.hero, { backgroundColor: StoreColors[store.store.color].hex }]}>
          <AppText variant="title" style={{ color: '#FFFFFF' }}>{store.store.name}</AppText>
          <AppText variant="caption" style={{ color: '#FFFFFF' }}>{tr('店主 {owner_name} · {p1} 月策展', { owner_name: store.store.owner_name, p1: monthOf(cur.period) })}</AppText>
        </View>
        <View style={{ padding: Spacing.xl }}>
          <CurationView title={cur.title} description={cur.description} items={cur.curation_items} color={store.store.color} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { margin: Spacing.lg, marginBottom: 0, borderRadius: Radius.md, padding: Spacing.md },
  hero: { padding: Spacing.xl, margin: Spacing.lg, borderRadius: Radius.xl, gap: 2 },
});
