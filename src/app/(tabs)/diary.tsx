import Feather from '@expo/vector-icons/Feather';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton, NotificationBell } from '@/components/icon-button';
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
 * 「寫日記」「打卡」（有開店再加「記一本書」）快速按鈕、最近幾天。只能記今天。週一到週三最上方有「上週回顧」（W1）。
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
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconButton icon="bar-chart-2" label={tr('每週回顧')} onPress={() => router.push('/diary/weeks')} />
          <IconButton icon="calendar" label={tr('日記月曆')} onPress={() => router.push('/diary/calendar')} />
          <NotificationBell />
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

  return (
    <Screen>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {header}
        <ScrollView
          contentContainerStyle={{ padding: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.md, paddingBottom: 96 }}
          refreshControl={<RefreshControl refreshing={day.isRefetching} onRefresh={refetch} />}>
          <WeekCard color={mine?.store.color} />
          {streak.data ? <StreakCard streak={streak.data} today={today} activeDays={activeSet} onPress={() => router.push('/diary/calendar')} /> : null}


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
                {tr('按右下角的＋寫日記、記正在讀的書；今天寫的心得、加入的想讀也會自動出現在這裡。')}
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

/** 快速按鈕：有開店時三個並排（寫日記、打卡、記一本書），改成上下排 */
const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icon: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: Spacing.sm },
  empty: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.lg, alignItems: 'center', padding: Spacing.xl, gap: 6 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, minHeight: 52 },
});
