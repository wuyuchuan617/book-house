import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Chip } from '@/components/form';
import { AppText } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { currentLang, tr } from '@/lib/i18n';
import { taipeiToday } from '@/lib/period';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
};
const WEEK_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const WEEK_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** 'YYYY-MM-DD' 的前一天 */
export const dayBefore = (date: string) => addDays(date, -1);

/** 上週末：上一個週六（今天是週日就是昨天） */
export function lastWeekend(today: string) {
  const w = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addDays(today, -(w === 6 ? 7 : w + 1));
}

/**
 * v1.7.1 Z1b 選日期（過去的日子）：上面快速選「今天／昨天／上週末」，下面月曆可以往前翻；今天以後不能選。
 * 選了就套用，按「完成」或點背景收起。
 */
export function DaySheet({ visible, title, value, onChange, onClose }: { visible: boolean; title: string; value: string; onChange: (date: string) => void; onClose: () => void }) {
  const c = useTheme();
  const today = taipeiToday();
  const [month, setMonth] = useState(value.slice(0, 7));
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const week = currentLang() === 'en' ? WEEK_EN : WEEK_ZH;
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };
  const canNext = month < today.slice(0, 7);
  const pick = (d: string) => {
    onChange(d);
    setMonth(d.slice(0, 7));
  };
  const quick: [string, string][] = [
    [tr('今天'), today],
    [tr('昨天'), dayBefore(today)],
    [tr('上週末'), lastWeekend(today)],
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose} style={styles.sheet}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <AppText variant="heading" style={{ flex: 1 }}>{title}</AppText>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10} style={{ minHeight: MinTouch, justifyContent: 'center' }}>
          <AppText style={{ color: c.primary, fontWeight: '700' }}>{tr('完成')}</AppText>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: Spacing.sm }}>
        {quick.map(([label, d]) => <Chip key={label} label={label} selected={value === d} onPress={() => pick(d)} />)}
      </ScrollView>
      <View style={[styles.card, { backgroundColor: c.surface }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={tr('上個月')} onPress={() => shift(-1)} style={styles.nav}>
            <Feather name="chevron-left" size={18} color={c.textSecondary} />
          </Pressable>
          <AppText variant="label" style={{ flex: 1, textAlign: 'center' }}>{currentLang() === 'en' ? `${y}-${pad(m)}` : tr('{y} 年 {m} 月', { y, m })}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={tr('下個月')} disabled={!canNext} onPress={() => shift(1)} style={styles.nav}>
            <Feather name="chevron-right" size={18} color={canNext ? c.textSecondary : c.border} />
          </Pressable>
        </View>
        <View style={styles.grid} accessibilityRole="radiogroup">
          {week.map((w, i) => (
            <View key={`w${i}`} style={[styles.cell, { height: 24 }]}>
              <AppText variant="caption" muted>{w}</AppText>
            </View>
          ))}
          {cells.map((d, i) => {
            if (!d) return <View key={`e${i}`} style={styles.cell} />;
            const date = `${month}-${pad(d)}`;
            const disabled = date > today;
            const selected = date === value;
            return (
              <Pressable
                key={date}
                accessibilityRole="radio"
                accessibilityLabel={date === today ? tr('今天 {d} 日', { d }) : tr('{d} 日', { d })}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => pick(date)}
                style={styles.cell}>
                <View style={[styles.day, selected && { backgroundColor: c.primary }, date === today && !selected && { borderWidth: 1.5, borderColor: c.primary }]}>
                  <AppText style={{ color: selected ? c.onPrimary : disabled ? c.textTertiary : c.text, fontWeight: selected ? '700' : '400' }}>{String(d)}</AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
  card: { borderRadius: Radius.lg, padding: Spacing.sm },
  nav: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: MinTouch, alignItems: 'center', justifyContent: 'center' },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
