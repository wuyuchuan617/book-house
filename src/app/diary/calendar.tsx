import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DiaryTimeline } from '@/components/diary-timeline';
import { WeekList } from '@/app/diary/weeks';

import { AppText, Card, Screen } from '@/components/ui';
import { MinTouch, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addDays, dayLabel, useActiveDays, useDiaryDay, useDiaryStreak } from '@/lib/diary';
import { tr } from '@/lib/i18n';
import { addMonths, currentPeriod, periodLabel, taipeiToday } from '@/lib/period';
import { useMyStore } from '@/lib/queries';

/**
 * D5 月曆：有記錄的日子上色、本月天數、連續與最長。
 * v1.8.2 AK6：點日期不換頁，下面直接列那天的內容（「看整天 ›」才進那天的完整頁）；AK14：上面切「月曆｜每週回顧」。
 */
export default function DiaryCalendarScreen() {
  const c = useTheme();
  const { view: initialView } = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<'month' | 'weeks'>(initialView === 'weeks' ? 'weeks' : 'month');
  const today = taipeiToday();
  const [period, setPeriod] = useState(currentPeriod());
  const [picked, setPicked] = useState(today);
  const day = useDiaryDay(picked);
  const { data: mine } = useMyStore();
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

  const seg = (
    <View style={[styles.seg, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
      {([['month', tr('月曆')], ['weeks', tr('每週回顧')]] as const).map(([k, label]) => (
        <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: view === k }} onPress={() => setView(k)} style={[styles.segItem, view === k && { backgroundColor: c.surface }]}>
          <AppText variant="caption" style={{ fontWeight: '700', color: view === k ? c.text : c.textSecondary }}>{label}</AppText>
        </Pressable>
      ))}
    </View>
  );

  if (view === 'weeks')
    return (
      <Screen>
        <Stack.Screen options={{ title: tr('日記月曆') }} />
        <WeekList header={seg} />
      </Screen>
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('日記月曆') }} />
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg, paddingBottom: 48 }}>
        {seg}
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
              const sel = d === picked;
              return (
                <View key={d} style={styles.cell}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={n ? tr('{date}，{n} 筆記錄', { date: d, n }) : d}
                    accessibilityState={{ selected: sel }}
                    disabled={future}
                    onPress={() => setPicked(d)}
                    style={[styles.day, { backgroundColor: sel ? c.primary : n ? c.surfaceMuted : 'transparent', borderColor: d === today && !sel ? c.primary : 'transparent', opacity: future ? 0.35 : 1 }]}>
                    <AppText style={{ fontSize: 14, fontWeight: n || sel || d === today ? '700' : '400', color: sel ? c.onPrimary : c.text }}>{Number(d.slice(8, 10))}</AppText>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Card>
        <View style={{ gap: Spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <AppText variant="label" style={{ fontSize: 16 }} accessibilityLiveRegion="polite">{dayLabel(picked)}</AppText>
            <AppText variant="caption" muted style={{ flex: 1 }}>{day.data?.items.length ? tr('{n} 則', { n: day.data.items.length }) : ''}</AppText>
            <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push({ pathname: '/diary/day/[date]', params: { date: picked } })} style={{ minHeight: 32, justifyContent: 'center' }}>
              <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('看整天 ›')}</AppText>
            </Pressable>
          </View>
          {day.isLoading ? (
            <ActivityIndicator style={{ marginTop: Spacing.lg }} />
          ) : day.data?.items.length ? (
            <DiaryTimeline items={day.data.items} isToday={picked === today} color={mine?.store.color} />
          ) : (
            <AppText muted style={{ textAlign: 'center', paddingVertical: Spacing.lg }}>{tr('這天沒有記錄')}</AppText>
          )}
        </View>
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
  seg: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segItem: { flex: 1, minHeight: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  day: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
