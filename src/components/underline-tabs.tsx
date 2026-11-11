import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { MinTouch, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** v1.7 可以橫滑的底線分頁（我的書店、書店頁共用） */
export function UnderlineTabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  const c = useTheme();
  return (
    <View style={[styles.wrap, { borderBottomColor: c.border, backgroundColor: c.background }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityRole="tablist">
        {tabs.map(([t, label]) => {
          const on = t === value;
          return (
            <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(t)} style={[styles.tab, { borderBottomColor: on ? c.text : 'transparent' }]}>
              <AppText style={{ fontSize: 15, fontWeight: on ? '700' : '500', color: on ? c.text : c.textSecondary }}>{label}</AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  row: { paddingHorizontal: Spacing.xl, gap: Spacing.xl },
  tab: { minHeight: MinTouch, justifyContent: 'center', borderBottomWidth: 2.5 },
});
