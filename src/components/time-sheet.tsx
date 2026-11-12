import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { AppText } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { currentLang, tr } from '@/lib/i18n';

const pad = (n: number) => String(n).padStart(2, '0');
const toDate = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
};
const fromDate = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** 「下午 1:00」 */
export function timeLabel(hhmm: string) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (currentLang() === 'en') return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
  return `${h < 12 ? tr('上午') : tr('下午')} ${((h + 11) % 12) + 1}:${pad(m)}`;
}

/**
 * v1.8 AI1 活動時間：用手機內建的時間選擇——iPhone 是滾輪（每 5 分鐘一格），Android 是系統時鐘對話框。
 * 上面切「開始／結束」；結束選填、可以清除、要晚於開始。網頁版用輸入框。
 */
export function TimeSheet({ visible, start, end, onChange, onClose }: { visible: boolean; start: string; end: string; onChange: (start: string, end: string) => void; onClose: () => void }) {
  const c = useTheme();
  const [which, setWhich] = useState<'start' | 'end'>('start');
  const value = which === 'start' ? start : end || fromDate(new Date(toDate(start).getTime() + 2 * 3600e3));

  const set = (hhmm: string) => {
    if (which === 'start') {
      // 開始改到結束之後：結束往後推，保持原本的長度
      if (end && mins(hhmm) >= mins(end)) {
        const len = Math.max(30, mins(end) - mins(start));
        const e = Math.min(23 * 60 + 55, mins(hhmm) + len);
        onChange(hhmm, `${pad(Math.floor(e / 60))}:${pad(e % 60)}`);
      } else onChange(hhmm, end);
    } else onChange(start, mins(hhmm) > mins(start) ? hhmm : end);
  };

  const onPicked = (e: DateTimePickerEvent, d?: Date) => {
    if (e.type === 'set' && d) set(fromDate(d));
  };

  const openAndroid = (w: 'start' | 'end') => {
    setWhich(w);
    DateTimePickerAndroid.open({
      value: toDate(w === 'start' ? start : end || fromDate(new Date(toDate(start).getTime() + 2 * 3600e3))),
      mode: 'time',
      is24Hour: false,
      minuteInterval: 5,
      onChange: (e, d) => {
        if (e.type === 'set' && d) {
          const hhmm = fromDate(d);
          if (w === 'start') onChange(hhmm, end && mins(end) <= mins(hhmm) ? '' : end);
          else onChange(start, mins(hhmm) > mins(start) ? hhmm : end);
        }
      },
    });
  };

  const tab = (w: 'start' | 'end', label: string, v: string) => (
    <Pressable
      key={w}
      accessibilityRole="tab"
      accessibilityState={{ selected: which === w }}
      onPress={() => (Platform.OS === 'android' ? openAndroid(w) : setWhich(w))}
      style={[styles.tab, which === w && Platform.OS !== 'android' && { backgroundColor: c.surface }]}>
      <AppText variant="caption" muted style={{ fontSize: 11 }}>{label}</AppText>
      <AppText style={{ fontWeight: '700', color: v ? c.text : c.textTertiary }}>{v ? timeLabel(v) : tr('不填')}</AppText>
    </Pressable>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} style={{ paddingHorizontal: Spacing.xl, gap: Spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <AppText variant="heading" style={{ flex: 1 }}>{tr('活動時間')}</AppText>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10} style={{ minHeight: MinTouch, justifyContent: 'center' }}>
          <AppText style={{ color: c.primary, fontWeight: '700' }}>{tr('完成')}</AppText>
        </Pressable>
      </View>
      <View style={[styles.seg, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
        {tab('start', tr('開始'), start)}
        {tab('end', tr('結束'), end)}
      </View>
      {Platform.OS === 'ios' ? (
        <View style={[styles.wheel, { backgroundColor: c.surface }]}>
          <DateTimePicker
            key={which}
            value={toDate(value)}
            mode="time"
            display="spinner"
            minuteInterval={5}
            locale={currentLang() === 'en' ? 'en-US' : 'zh-TW'}
            onChange={onPicked}
            textColor={c.text}
          />
        </View>
      ) : Platform.OS === 'web' ? (
        <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
          <TextInput
            value={which === 'start' ? start : end}
            onChangeText={(t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t) && set(t)}
            placeholder="13:00"
            accessibilityLabel={which === 'start' ? tr('開始時間') : tr('結束時間（選填）')}
            style={[styles.web, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
          />
        </View>
      ) : (
        <AppText variant="caption" muted>{tr('點上面的開始或結束，用手機的時鐘選時間。')}</AppText>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <AppText variant="caption" muted style={{ flex: 1 }}>{tr('結束時間選填')}</AppText>
        {end ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { onChange(start, ''); setWhich('start'); }}>
            <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('清除結束時間')}</AppText>
          </Pressable>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: 9 },
  wheel: { borderRadius: Radius.lg, alignItems: 'center', overflow: 'hidden' },
  web: { flex: 1, height: 44, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, fontSize: 16 },
});
