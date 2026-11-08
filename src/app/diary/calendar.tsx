import Feather from '@expo/vector-icons/Feather';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Screen } from '@/components/ui';
import { MinTouch, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addDays, useActiveDays, useDiaryStreak } from '@/lib/diary';
import { tr } from '@/lib/i18n';
import { addMonths, currentPeriod, periodLabel, taipeiToday } from '@/lib/period';

/** D5 月曆：有記錄的日子上色（點了看那天）、本月天數、連續與最長 */
export default function DiaryCalendarScreen() {
  const c = useTheme();
  const today = taipeiToday();
  const [period, setPeriod] = useState(currentPeriod());
  const end = addDays(addMonths(period, 1), -1);
  const active = useActiveDays(period, end);
  const streak = useDiaryStreak();

  const counts = useMemo(() => new Map((active.data ?? []).map((d) => [d.day, d.entries + d.notes])), [active.data]);
  const lead = (new Date(`${period}T00:00:00Z`).getUTCDay() + 6) % 7; // 週一開始
  const days = Number(end.slice(8, 10));
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => addDays(period, i))];
  while (cells.length % 7) cells.push(null);
  const isCurrent = period === currentPeriod();
  const names = [tr('一'), tr('二'), tr('三'), tr('四'), tr('五'), tr('六'), tr('日')];

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('日記月曆') }} />
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }}>
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <Stat label={tr('目前連續')} value={tr('{n} 天', { n: streak.data?.current_streak ?? 0 })} />
          <Stat label={tr('最長連續')} value={tr('{n} 天', { n: streak.data?.longest_streak ?? 0 })} />
          <Stat label={tr('這個月')} value={tr('{n} 天', { n: active.data?.length ?? 0 })} />
        </View>

        <Card style={{ gap: Spacing.md }}>
          <View style={styles.month}>
            <Pressable accessibilityRole="button" accessibilityLabel={tr('上一個月')} onPress={() => setPeriod(addMonths(period, -1))} style={styles.arrow}>
              <Feather name="chevron-left" size={20} color={c.text} />
            </Pressable>
            <AppText variant="label" accessibilityLiveRegion="polite">{periodLabel(period)}</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel={tr('下一個月')} disabled={isCurrent} onPress={() => setPeriod(addMonths(period, 1))} style={[styles.arrow, { opacity: isCurrent ? 0.3 : 1 }]}>
              <Feather name="chevron-right" size={20} color={c.text} />
            </Pressable>
          </View>
          <View style={styles.grid}>
            {names.map((n) => (
              <View key={n} style={styles.cell}>
                <AppText variant="caption" style={{ color: c.textTertiary, fontSize: 11 }}>{n}</AppText>
              </View>
            ))}
            {cells.map((d, i) => {
              if (!d) return <View key={`e${i}`} style={styles.cell} />;
              const n = counts.get(d) ?? 0;
              const future = d > today;
              return (
                <View key={d} style={styles.cell}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={n ? tr('{date}，{n} 筆記錄', { date: d, n }) : d}
                    disabled={future}
                    onPress={() => router.push({ pathname: '/diary/day/[date]', params: { date: d } })}
                    style={[styles.day, { backgroundColor: n ? c.primary : 'transparent', borderColor: d === today ? c.primary : 'transparent', opacity: future ? 0.35 : 1 }]}>
                    <AppText style={{ fontSize: 14, fontWeight: n || d === today ? '700' : '400', color: n ? c.onPrimary : c.text }}>{Number(d.slice(8, 10))}</AppText>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Card>
        <Button kind="secondary" label={tr('看每週回顧')} onPress={() => router.push('/diary/weeks')} />
        <AppText variant="caption" muted style={{ textAlign: 'center' }}>{tr('自己記的日記和當天寫的心得都算一天。日記只能記當天的。')}</AppText>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const c = useTheme();
  return (
    <Card style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: Spacing.md }}>
      <AppText style={{ fontSize: 20, fontWeight: '800', color: c.primary }}>{value}</AppText>
      <AppText variant="caption" muted>{label}</AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  month: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  day: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
