import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addDays, dayLabel, eventRangeLabel } from '@/lib/diary';
import { currentLang, tr } from '@/lib/i18n';
import { addMonths, taipeiToday } from '@/lib/period';

const pad = (n: number) => String(n).padStart(2, '0');
const WEEK_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const WEEK_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * 選活動日期（可以多天）：先點開始日，再點結束日；點已選的開始日或更早的日子會重選開始日。
 * 原則上今天以前不能選（編輯已存的活動保留原本開始日），最遠可以選到一年後。
 */
export function DateRangeSheet({
  visible,
  initialStart,
  initialEnd,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  initialStart?: string | null;
  initialEnd?: string | null;
  onConfirm: (range: { startsOn: string; endsOn: string } | null) => void;
  onClose: () => void;
}) {
  const c = useTheme();
  const today = taipeiToday();
  const last = addDays(today, 365);
  // 編輯已存的活動時，開始日可能已經過了：保留它，只是不讓再選更早的日子
  const earliest = initialStart && initialStart < today ? initialStart : today;
  const [month, setMonth] = useState(() => (initialStart ?? today).slice(0, 7));
  const [start, setStart] = useState<string | null>(initialStart ?? null);
  const [end, setEnd] = useState<string | null>(initialEnd && initialStart && initialEnd >= initialStart ? initialEnd : initialStart ?? null);
  const [pickingEnd, setPickingEnd] = useState(false);

  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const dateOf = (d: number) => `${y}-${pad(m)}-${pad(d)}`;
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const week = currentLang() === 'en' ? WEEK_EN : WEEK_ZH;
  const canPrev = month > earliest.slice(0, 7);
  const canNext = month < last.slice(0, 7);
  const move = (n: number) => setMonth(addMonths(`${month}-01`, n).slice(0, 7));

  const pick = (date: string) => {
    if (!pickingEnd || !start || date < start) {
      setStart(date);
      setEnd(date);
      setPickingEnd(true);
      return;
    }
    setEnd(date);
    setPickingEnd(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={tr('關閉')} />
      <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: c.background }]}>
        <AppText variant="heading">{tr('選擇活動日期')}</AppText>
        <AppText variant="caption" muted>{tr('活動可能辦好幾天：先選第一天，再選最後一天；只有一天就選同一天。')}</AppText>

        <View style={styles.monthRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={tr('上個月')} disabled={!canPrev} onPress={() => move(-1)} style={[styles.arrow, { opacity: canPrev ? 1 : 0.3 }]}>
            <Feather name="chevron-left" size={20} color={c.text} />
          </Pressable>
          <AppText variant="label">{tr('{p0} 年 {p1} 月', { p0: y, p1: m })}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={tr('下個月')} disabled={!canNext} onPress={() => move(1)} style={[styles.arrow, { opacity: canNext ? 1 : 0.3 }]}>
            <Feather name="chevron-right" size={20} color={c.text} />
          </Pressable>
        </View>

        <View style={styles.grid} accessibilityRole="radiogroup">
          {week.map((w, i) => (
            <View key={`w${i}`} style={styles.cell}>
              <AppText variant="caption" muted>{w}</AppText>
            </View>
          ))}
          {cells.map((d, i) => {
            if (!d) return <View key={`e${i}`} style={styles.cell} />;
            const date = dateOf(d);
            const disabled = date < earliest || date > last;
            const isStart = date === start;
            const isEnd = date === end;
            const inRange = !!start && !!end && date > start && date < end;
            return (
              <Pressable
                key={date}
                accessibilityRole="radio"
                accessibilityLabel={date === today ? tr('今天 {d} 日', { d }) : tr('{d} 日', { d })}
                accessibilityState={{ selected: isStart || isEnd, disabled }}
                disabled={disabled}
                onPress={() => pick(date)}
                style={styles.cell}>
                <View
                  style={[
                    styles.day,
                    inRange && { backgroundColor: c.surfaceMuted, borderRadius: 0, width: '100%' },
                    (isStart || isEnd) && { backgroundColor: c.primary },
                    date === today && !isStart && !isEnd && { borderWidth: 1.5, borderColor: c.primary },
                  ]}>
                  <AppText style={{ color: isStart || isEnd ? c.onPrimary : disabled ? c.textTertiary : c.text, fontWeight: isStart || isEnd ? '700' : '400' }}>{String(d)}</AppText>
                </View>
              </Pressable>
            );
          })}
        </View>

        <AppText variant="label" style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">
          {start ? (pickingEnd ? tr('{date} 起，再選最後一天', { date: dayLabel(start) }) : eventRangeLabel(start, end)) : tr('還沒有選日期')}
        </AppText>
        <Button label={tr('就這段日期')} disabled={!start} onPress={() => start && onConfirm({ startsOn: start, endsOn: end ?? start })} style={{ marginTop: Spacing.sm }} />
        {start ? <Button kind="link" label={tr('清除日期')} onPress={() => onConfirm(null)} /> : null}
        <Button kind="secondary" label={tr('取消')} onPress={onClose} />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.sm },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  arrow: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: MinTouch, alignItems: 'center', justifyContent: 'center' },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
