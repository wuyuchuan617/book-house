import { ListSkeleton } from '@/components/skeleton';
import Feather from '@expo/vector-icons/Feather';
import { router, Stack } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { AppText, EmptyState, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';
import { isoWeek, thisWeekStart, useWeekList, weekRange } from '@/lib/weekly';

/** W5 過去的回顧（v1.8.2 AK14：也放在日記月曆的「每週回顧」分頁） */
export default function WeekListScreen() {
  return (
    <Screen>
      <Stack.Screen options={{ title: tr('每週回顧') }} />
      <WeekList />
    </Screen>
  );
}

/** 每一週的天數、心得數；點進去看那週 */
export function WeekList({ header }: { header?: React.ReactElement }) {
  const c = useTheme();
  const { data, isLoading } = useWeekList(26);
  const current = thisWeekStart();

  return (
    <>
      {isLoading ? (
        <ListSkeleton />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(w) => w.week_start}
          contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.sm, paddingBottom: 48 }}
          ListEmptyComponent={<EmptyState title={tr('還沒有回顧')} body={tr('開始記日記後，每週一會整理好上一週。')} />}
          renderItem={({ item }) => {
            const empty = !item.active_days;
            return (
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push({ pathname: '/diary/week/[start]', params: { start: item.week_start, from: 'history' } })}
                style={({ pressed }) => [styles.row, { backgroundColor: c.surface, opacity: pressed ? 0.85 : 1 }]}>
                <View style={[styles.wk, { backgroundColor: item.week_start === current ? c.surfaceMuted : c.background }]} accessibilityLabel={tr('第 {n} 週', { n: isoWeek(item.week_start) })}>
                  <AppText style={{ fontSize: 10, lineHeight: 12, color: c.textSecondary }}>{tr('週')}</AppText>
                  <AppText style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', color: item.week_start === current ? c.primary : c.text }}>{String(isoWeek(item.week_start))}</AppText>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label">{item.week_start === current ? tr('本週到目前') : weekRange(item.week_start)}</AppText>
                  <AppText variant="caption" muted>
                    {[
                      tr('第 {n} 週', { n: isoWeek(item.week_start) }),
                      item.week_start === current ? weekRange(item.week_start) : null,
                      ...(empty ? [tr('休息了一下')] : [tr('讀了 {n} 天', { n: item.active_days }), item.reading_notes ? tr('{n} 則心得', { n: item.reading_notes }) : null]),
                    ].filter(Boolean).join(' · ')}
                  </AppText>
                </View>
                {item.has_reflection ? <Feather name="message-square" size={16} color={c.primary} accessibilityLabel={tr('寫了一句話')} /> : null}
                <View style={{ flexDirection: 'row', gap: 3 }}>
                  {Array.from({ length: 7 }, (_, i) => (
                    <View key={i} style={[styles.bar, { backgroundColor: i < item.active_days ? c.primary : c.surfaceMuted }]} />
                  ))}
                </View>
                <Feather name="chevron-right" size={18} color={c.textTertiary} />
              </Pressable>
            );
          }}
          ListHeaderComponent={
            <View style={{ gap: Spacing.md }}>
              {header}
              {data?.length ? <AppText variant="caption" muted style={{ marginBottom: Spacing.xs }}>{tr('週一到週日，台北時間。')}</AppText> : null}
            </View>
          }
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, minHeight: 64, paddingVertical: Spacing.sm },
  bar: { width: 6, height: 18, borderRadius: 3 },
  wk: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
