import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DiaryTimeline } from '@/components/diary-timeline';
import { AppText, Button, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addDays, dayLabel, useDiaryDay } from '@/lib/diary';
import { tr } from '@/lib/i18n';
import { taipeiToday } from '@/lib/period';
import { useMyStore } from '@/lib/queries';

/** D4 某一天（唯讀）：過去的日記不能修改，可以刪除、把公開打卡改回私人 */
export default function DiaryDayScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const c = useTheme();
  const today = taipeiToday();
  const day = useDiaryDay(date);
  const { data: mine } = useMyStore();
  const isToday = date === today;
  const go = (d: string) => router.setParams({ date: d });

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('日記') }} />
      <View style={styles.nav}>
        <Pressable accessibilityRole="button" accessibilityLabel={tr('前一天')} onPress={() => go(addDays(date, -1))} style={styles.arrow}>
          <Feather name="chevron-left" size={22} color={c.text} />
        </Pressable>
        <AppText variant="label" accessibilityLiveRegion="polite">{dayLabel(date)}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={tr('後一天')} disabled={date >= today} onPress={() => go(addDays(date, 1))} style={[styles.arrow, { opacity: date >= today ? 0.3 : 1 }]}>
          <Feather name="chevron-right" size={22} color={c.text} />
        </Pressable>
      </View>
      {day.isLoading ? (
        <ActivityIndicator style={{ marginTop: 48 }} />
      ) : day.data?.items.length ? (
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md, paddingBottom: 40 }}>
          {!isToday ? <AppText variant="caption" muted>{tr('日記 7 天內可以編輯；超過 7 天只能改公開設定和刪除。')}</AppText> : null}
          <DiaryTimeline items={day.data.items} isToday={isToday} date={date} color={mine?.store.color} />
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <EmptyState title={tr('這天沒有記錄')} body={isToday ? tr('寫一句，開始今天的日記。') : tr('日記只能記當天的，這天就讓它空著吧。')} />
          {isToday ? <Button label={tr('寫日記')} style={{ marginHorizontal: Spacing.xl }} onPress={() => router.push({ pathname: '/diary/compose', params: { kind: 'note' } })} /> : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  arrow: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center' },
});
