import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { AppText } from '@/components/ui';
import { Radius, Spacing, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';
import { taipeiToday } from '@/lib/period';
import { isEmptyWeek, lastWeekStart, useWeekReview, weekLabel } from '@/lib/weekly';

/** W1 日記最上方的「上週回顧」：週一到週三顯示；看過就縮成一行 */
export function WeekCard({ color = 'clay' }: { color?: StoreColor }) {
  const c = useTheme();
  const ws = lastWeekStart();
  const { data: week } = useWeekReview(ws);
  const dow = (new Date(`${taipeiToday()}T00:00:00Z`).getUTCDay() + 6) % 7;
  if (!week || dow > 2) return null;
  const open = () => router.push({ pathname: '/diary/week/[start]', params: { start: ws, from: 'card' } });
  const empty = isEmptyWeek(week);

  if (week.reflection.opened_at) {
    return (
      <Pressable accessibilityRole="link" onPress={open} style={({ pressed }) => [styles.compact, { backgroundColor: c.surface, opacity: pressed ? 0.85 : 1 }]}>
        <Feather name="bar-chart-2" size={16} color={c.primary} />
        <AppText variant="label" style={{ flex: 1 }}>{tr('上週回顧')}</AppText>
        <AppText variant="caption" muted>{empty ? tr('休息了一下') : tr('讀了 {n} 天', { n: week.counts.active_days })}</AppText>
        <Feather name="chevron-right" size={18} color={c.textTertiary} />
      </Pressable>
    );
  }

  return (
    <Pressable accessibilityRole="link" accessibilityLabel={tr('上週回顧好了，打開看看')} onPress={open} style={({ pressed }) => [styles.card, { backgroundColor: c.primary, opacity: pressed ? 0.9 : 1 }]}>
      <View style={{ flex: 1, gap: 4 }}>
        <AppText variant="caption" style={{ color: c.onPrimary, opacity: 0.85 }}>{tr('上週回顧 · {range}', { range: weekLabel(ws) })}</AppText>
        <AppText style={{ color: c.onPrimary, fontSize: 20, fontWeight: '800' }}>
          {empty ? tr('上週休息了一下') : tr('你讀了 {n} 天', { n: week.counts.active_days })}
        </AppText>
        <AppText variant="caption" style={{ color: c.onPrimary, opacity: 0.85 }}>
          {empty ? tr('看看想讀清單，挑一本這週讀') : tr('寫一句話，挑下週想讀的書')}
        </AppText>
      </View>
      {week.books.length ? (
        <View style={{ flexDirection: 'row' }}>
          {week.books.slice(0, 3).map((b, i) => (
            <View key={b.id} style={{ marginLeft: i ? -18 : 0, transform: [{ rotate: `${(i - 1) * 6}deg` }] }}>
              <BookCover title={b.title} url={b.cover_url} color={color} size="sm" />
            </View>
          ))}
        </View>
      ) : (
        <Feather name="chevron-right" size={22} color={c.onPrimary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.xl, padding: Spacing.lg },
  compact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, minHeight: 52 },
});
