import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';

/** v1.9 AL8 載入中的骨架畫面：幾張卡片形狀的灰塊慢慢閃，取代整頁轉圈圈（看起來比較快，版面也不會跳） */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  const c = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View style={[styles.wrap, { opacity: pulse }]} accessibilityRole="progressbar" accessibilityLabel={tr('載入中')}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[styles.card, { backgroundColor: c.surface }]}>
          <View style={[styles.thumb, { backgroundColor: c.surfaceMuted }]} />
          <View style={{ flex: 1, gap: Spacing.sm }}>
            <View style={[styles.line, { width: '70%', backgroundColor: c.surfaceMuted }]} />
            <View style={[styles.line, { width: '45%', backgroundColor: c.divider }]} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: Spacing.xl, gap: Spacing.md },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.xl, padding: Spacing.lg },
  thumb: { width: 44, height: 60, borderRadius: Radius.sm },
  line: { height: 12, borderRadius: 6 },
});
