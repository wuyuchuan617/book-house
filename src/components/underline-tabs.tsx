import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { MinTouch, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * v1.7.2 固定的底線分頁（我的書店、書店頁共用）：標籤短、不放數字，平均分配寬度、不用橫滑；
 * 選中的是粗體＋主色粗底線。放在 ScrollView 的 stickyHeaderIndices 裡，往下捲時黏在最上面。
 */
export function UnderlineTabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  const c = useTheme();
  return (
    <View style={[styles.wrap, { borderBottomColor: c.border, backgroundColor: c.background }]} accessibilityRole="tablist">
      {tabs.map(([t, label]) => {
        const on = t === value;
        return (
          <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(t)} style={styles.tab}>
            <AppText numberOfLines={1} style={{ fontSize: 15, fontWeight: on ? '700' : '500', color: on ? c.text : c.textSecondary }}>{label}</AppText>
            {on ? <View style={[styles.bar, { backgroundColor: c.primary }]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', paddingHorizontal: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, minHeight: MinTouch, alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', bottom: 0, left: '22%', right: '22%', height: 3, borderRadius: 2 },
});
