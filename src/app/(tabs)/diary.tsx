import Feather from '@expo/vector-icons/Feather';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { DiaryTimeline } from '@/components/diary-timeline';
import { WeekCard } from '@/components/week-card';
import { MonthWrapCard } from '@/components/month-wrap';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { addDays, dayLabel, useActiveDays, useDiaryDay, useDiaryStreak } from '@/lib/diary';
import { tr } from '@/lib/i18n';
import { taipeiToday } from '@/lib/period';
import { useMyStore } from '@/lib/queries';
import { AboutIntro, AboutLink } from '@/components/about';

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

  const recent = useMemo(() => (active.data ?? []).filter((d) => d.day < today).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 7), [active.data, today]);

  const header = (
    <View style={styles.header}>
      <AppText variant="title">{tr('日記')}</AppText>
      {session ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconButton icon="calendar" label={tr('日記月曆')} onPress={() => router.push('/diary/calendar')} />
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
          {mine ? <MonthWrapCard color={mine.store.color} /> : null}
          {/* v1.9 AL7：連續天數縮成「今天」那一行的小標；最上面一條「今天讀了什麼？」直接寫 */}
          <View style={[styles.sectionHead, { alignItems: 'center', marginTop: 0 }]}>
            <AppText variant="heading">{tr('今天')}</AppText>
            <AppText variant="caption" muted style={{ flex: 1 }}>{dayLabel(today)}</AppText>
            {streak.data?.current_streak ? (
              <Pressable accessibilityRole="link" accessibilityLabel={tr('連續 {n} 天，看月曆', { n: streak.data.current_streak })} hitSlop={8} onPress={() => router.push('/diary/calendar')} style={[styles.streak, { backgroundColor: c.surfaceMuted }]}>
                <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('連續 {n} 天', { n: streak.data.current_streak })}</AppText>
              </Pressable>
            ) : null}
            <AboutLink feature="diary" />
          </View>
          <View style={[styles.quick, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={tr('寫日記')} onPress={() => router.push({ pathname: '/diary/compose', params: { kind: 'post' } })} style={{ flex: 1, minHeight: MinTouch, justifyContent: 'center' }}>
              <AppText style={{ color: c.textSecondary }}>{tr('今天讀了什麼？')}</AppText>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={tr('正在讀：記讀到哪')} onPress={() => router.push({ pathname: '/diary/compose', params: { kind: 'reading' } })} style={[styles.quickBtn, { backgroundColor: c.background }]}>
              <Feather name="book-open" size={17} color={c.text} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={tr('打卡')} onPress={() => router.push({ pathname: '/diary/compose', params: { kind: 'checkin' } })} style={[styles.quickBtn, { backgroundColor: c.background }]}>
              <Feather name="map-pin" size={17} color={c.text} />
            </Pressable>
          </View>
          {day.isLoading ? (
            <ActivityIndicator style={{ marginTop: 24 }} />
          ) : items.length ? (
            <DiaryTimeline items={items} isToday color={mine?.store.color} />
          ) : (
            <View style={[styles.empty, { borderColor: c.border }]}>
              <AppText variant="label">{tr('今天還沒有記錄')}</AppText>
              <AppText variant="caption" muted style={{ textAlign: 'center' }}>
                {tr('在上面寫一句就開始；今天寫的心得、加入的想讀也會自動出現在這裡。')}
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
      <AboutIntro feature="diary" />
    </Screen>
  );
}

/** 快速按鈕：有開店時三個並排（寫日記、打卡、記一本書），改成上下排 */
const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icon: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm, justifyContent: 'space-between', marginTop: Spacing.sm },
  streak: { borderRadius: Radius.pill, paddingHorizontal: 10, minHeight: 28, justifyContent: 'center' },
  quick: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.xl, borderWidth: 1, paddingLeft: Spacing.lg, paddingRight: Spacing.sm, minHeight: 56 },
  quickBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  empty: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.lg, alignItems: 'center', padding: Spacing.xl, gap: 6 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, minHeight: 52 },
});
