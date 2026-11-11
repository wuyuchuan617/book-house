import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { AppText, Button } from '@/components/ui';
import { MinTouch, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { currentLang, tr } from '@/lib/i18n';
import { periodLabel, taipeiToday } from '@/lib/period';

const pad = (n: number) => String(n).padStart(2, '0');
const WEEK_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const WEEK_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * 選上架日期：策展月份的月曆，今天以前不能選。台北時間早上 9 點上架；選今天就立刻上架。
 * period = 'YYYY-MM-01'；回傳 'YYYY-MM-DD'
 */
export function PublishDateSheet({
  visible,
  period,
  initial,
  loading,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  period: string;
  initial?: string | null;
  loading?: boolean;
  onConfirm: (date: string) => void;
  onClose: () => void;
}) {
  const c = useTheme();
  const today = taipeiToday();
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const dateOf = (d: number) => `${y}-${pad(m)}-${pad(d)}`;
  const earliest = period > today ? period : today;
  const [picked, setPicked] = useState<string>(initial && initial >= earliest ? initial : earliest);
  const isToday = picked === today;
  const md = `${m}/${Number(picked.slice(8, 10))}`;
  const week = currentLang() === 'en' ? WEEK_EN : WEEK_ZH;

  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  return (
    <BottomSheet visible={visible} onClose={onClose} style={styles.sheet}>
        <AppText variant="heading">{tr('選擇上架日期')}</AppText>
        <AppText variant="caption" muted>{tr('台北時間早上 9 點上架；選今天會立刻上架。上架前都能修改。')}</AppText>
        <AppText variant="label" style={{ marginTop: Spacing.md }}>{periodLabel(period)}</AppText>
        <View style={styles.grid} accessibilityRole="radiogroup">
          {week.map((w, i) => (
            <View key={`w${i}`} style={styles.cell}>
              <AppText variant="caption" muted>{w}</AppText>
            </View>
          ))}
          {cells.map((d, i) => {
            if (!d) return <View key={`e${i}`} style={styles.cell} />;
            const date = dateOf(d);
            const disabled = date < earliest;
            const selected = date === picked;
            return (
              <Pressable
                key={date}
                accessibilityRole="radio"
                accessibilityLabel={date === today ? tr('今天 {d} 日', { d }) : tr('{d} 日', { d })}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => setPicked(date)}
                style={styles.cell}>
                <View style={[styles.day, selected && { backgroundColor: c.primary }, date === today && !selected && { borderWidth: 1.5, borderColor: c.primary }]}>
                  <AppText style={{ color: selected ? c.onPrimary : disabled ? c.textTertiary : c.text, fontWeight: selected ? '700' : '400' }}>{String(d)}</AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Button
          label={isToday ? tr('今天上架') : tr('預約 {md} 上架', { md })}
          loading={loading}
          onPress={() => onConfirm(picked)}
          style={{ marginTop: Spacing.md }}
        />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: MinTouch, alignItems: 'center', justifyContent: 'center' },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
