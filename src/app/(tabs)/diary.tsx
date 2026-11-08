import Feather from '@expo/vector-icons/Feather';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StreakCard } from '@/components/diary';
import { DiaryTimeline } from '@/components/diary-timeline';
import { WeekCard } from '@/components/week-card';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { addDays, dayLabel, useActiveDays, useDiaryDay, useDiaryStreak } from '@/lib/diary';
import { tr } from '@/lib/i18n';
import { taipeiToday } from '@/lib/period';
import { useMyStore } from '@/lib/queries';

/**
 * D1 日記（只有自己看得到）：連續記錄、今天的時間軸（自己記的＋當天的心得、想讀、開始讀、讀完）、
 * 「記一筆」「打卡」兩個快速按鈕、最近幾天。只能記今天。週一到週三最上方有「上週回顧」（W1）。
 */
export default function DiaryScreen() {
  const c = useTheme();
  const { session, requireAuth } = useAuth();
  const today = taipeiToday();
  const day = useDiaryDay();
  const streak = useDiaryStreak();
  const active = useActiveDays(addDays(today, -30), today);
  const { data: mine } = useMyStore();

  useFocusEffect(
    useCallback(() => {
      if (session) track('diary_opened', {});
    }, [session]),
  );

  const activeSet = useMemo(() => new Set((active.data ?? []).map((d) => d.day)), [active.data]);
  const recent = useMemo(() => (active.data ?? []).filter((d) => d.day < today).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 7), [active.data, today]);

  const header = (
    <View style={styles.header}>
      <AppText variant="title">{tr('日記')}</AppText>
      {session ? (
        <View style={{ flexDirection: 'row' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={tr('每週回顧')} onPress={() => router.push('/diary/weeks')} style={styles.icon}>
            <Feather name="bar-chart-2" size={22} color={c.text} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={tr('日記月曆')} onPress={() => router.push('/diary/calendar')} style={styles.icon}>
            <Feather name="calendar" size={22} color={c.text} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  if (!session) {
    return (
      <Screen>
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          {header}
          <EmptyState title={tr('登入後開始寫閱讀日記')} body={tr('每天記一句、拍一張，或在有書的地方打卡。日記只有自己看得到。')} actionLabel={tr('登入')} onAction={() => requireAuth(() => {})} />
        </SafeAreaView>
      </Screen>
    );
  }

  const items = day.data?.items ?? [];
  const refetch = () => void Promise.all([day.refetch(), streak.refetch(), active.refetch()]);
  const compose = (kind: 'note' | 'checkin') => router.push({ pathname: '/diary/compose', params: { kind } });

  return (
    <Screen>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {header}
        <ScrollView
          contentContainerStyle={{ padding: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.md, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={day.isRefetching} onRefresh={refetch} />}>
          <WeekCard color={mine?.store.color} />
          {streak.data ? <StreakCard streak={streak.data} today={today} activeDays={activeSet} onPress={() => router.push('/diary/calendar')} /> : null}

          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <QuickButton icon="edit-3" label={tr('記一筆')} sub={tr('一句話、一張照片')} onPress={() => compose('note')} />
            <QuickButton icon="map-pin" label={tr('打卡')} sub={tr('在有書的地方')} onPress={() => compose('checkin')} />
          </View>

          <View style={styles.sectionHead}>
            <AppText variant="heading">{tr('今天')}</AppText>
            <AppText variant="caption" muted>{dayLabel(today)}</AppText>
          </View>
          {day.isLoading ? (
            <ActivityIndicator style={{ marginTop: 24 }} />
          ) : items.length ? (
            <DiaryTimeline items={items} isToday color={mine?.store.color} />
          ) : (
            <View style={[styles.empty, { borderColor: c.border }]}>
              <AppText variant="label">{tr('今天還沒有記錄')}</AppText>
              <AppText variant="caption" muted style={{ textAlign: 'center' }}>
                {mine ? tr('記一筆、打個卡；今天寫的心得、加入的想讀也會自動出現在這裡。') : tr('記一筆、打個卡；今天加入的想讀也會自動出現在這裡。')}
              </AppText>
            </View>
          )}

          {recent.length ? (
            <>
              <View style={[styles.sectionHead, { marginTop: Spacing.md }]}>
                <AppText variant="heading">{tr('最近')}</AppText>
                <Pressable accessibilityRole="button" onPress={() => router.push('/diary/calendar')} hitSlop={8}>
                  <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('看月曆')}</AppText>
                </Pressable>
              </View>
              {recent.map((d) => (
                <Pressable
                  key={d.day}
                  accessibilityRole="link"
                  onPress={() => router.push({ pathname: '/diary/day/[date]', params: { date: d.day } })}
                  style={({ pressed }) => [styles.dayRow, { backgroundColor: c.surface, opacity: pressed ? 0.85 : 1 }]}>
                  <AppText variant="label" style={{ width: 92 }}>{dayLabel(d.day)}</AppText>
                  <AppText variant="caption" muted style={{ flex: 1 }}>
                    {[d.entries ? tr('{n} 筆日記', { n: d.entries }) : null, d.notes ? tr('{n} 則心得', { n: d.notes }) : null].filter(Boolean).join(' · ')}
                  </AppText>
                  <Feather name="chevron-right" size={18} color={c.textTertiary} />
                </Pressable>
              ))}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

function QuickButton({ icon, label, sub, onPress }: { icon: 'edit-3' | 'map-pin'; label: string; sub: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.quick, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.quickIcon, { backgroundColor: c.primary }]}>
        <Feather name={icon} size={18} color={c.onPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="label">{label}</AppText>
        <AppText variant="caption" muted numberOfLines={2}>{sub}</AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icon: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: Spacing.sm },
  empty: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.lg, alignItems: 'center', padding: Spacing.xl, gap: 6 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, minHeight: 52 },
  quick: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, minHeight: 64 },
  quickIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
