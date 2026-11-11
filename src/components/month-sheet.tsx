import Feather from '@expo/vector-icons/Feather';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { AppText } from '@/components/ui';
import { MinTouch, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';
import { addMonths, currentPeriod, monthOf, periodLabel } from '@/lib/period';

/** 從本月往回列到最早有策展的月份（最多 12 個月）；沒有策展的月份也列出來（0 檔） */
export function monthOptions(months: { period: string; curation_count: number }[] | undefined) {
  const counts = new Map((months ?? []).map((m) => [m.period, m.curation_count]));
  const earliest = [...counts.keys()].sort()[0] ?? currentPeriod();
  const out: { period: string; count: number }[] = [];
  let p = currentPeriod();
  for (let i = 0; i < 12; i++) {
    out.push({ period: p, count: counts.get(p) ?? 0 });
    if (p <= earliest) break;
    p = addMonths(p, -1);
  }
  return out;
}

/** W8 選月份（策展）：跟其他底部選單同一種，點背景或往下拉關閉 */
export function MonthSheet({ visible, value, months, onPick, onClose }: {
  visible: boolean;
  value: string;
  months: { period: string; curation_count: number }[] | undefined;
  onPick: (period: string) => void;
  onClose: () => void;
}) {
  const c = useTheme();
  const rows = monthOptions(months);
  return (
    <BottomSheet visible={visible} onClose={onClose} style={{ paddingHorizontal: Spacing.lg, gap: 10 }}>
      <AppText variant="label" style={{ fontSize: 15, paddingHorizontal: 4 }}>{tr('選月份 · 策展')}</AppText>
      <ScrollView style={[styles.group, { backgroundColor: c.surface }]} bounces={false}>
        <View accessibilityRole="radiogroup">
          {rows.map((r, i) => {
            const on = r.period === value;
            const label = r.period === currentPeriod() ? tr('{p0} · 本月', { p0: periodLabel(r.period) }) : periodLabel(r.period);
            return (
              <Pressable
                key={r.period}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={tr('{label}，{n} 檔策展', { label, n: r.count })}
                onPress={() => {
                  onPick(r.period);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.row,
                  { opacity: pressed ? 0.6 : 1, borderBottomColor: c.divider, borderBottomWidth: i === rows.length - 1 ? 0 : StyleSheet.hairlineWidth },
                ]}>
                <AppText style={{ flex: 1, fontWeight: on ? '700' : '600', color: on ? c.primary : c.text }}>{label}</AppText>
                <AppText variant="caption" muted>{tr('{n} 檔', { n: r.count })}</AppText>
                <View style={{ width: 22, alignItems: 'center' }}>{on ? <Feather name="check" size={18} color={c.primary} /> : null}</View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

export const monthPillLabel = (period: string) =>
  period === currentPeriod() ? tr('{p0} 月 · 本月', { p0: monthOf(period) }) : periodLabel(period);

const styles = StyleSheet.create({
  group: { borderRadius: 16, maxHeight: 420 },
  row: { minHeight: MinTouch + 8, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
});
