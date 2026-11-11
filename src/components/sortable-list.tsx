import Feather from '@expo/vector-icons/Feather';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useTheme } from '@/hooks/use-theme';
import { tick } from '@/lib/haptics';
import { tr } from '@/lib/i18n';

type Props<T> = {
  items: T[];
  keyOf: (item: T) => string;
  rowHeight: number;
  renderRow: (item: T, index: number) => ReactNode;
  /** 放開手指後的新順序（id 陣列）；順序沒變就不會呼叫 */
  onReorder: (ids: string[]) => void;
};

/**
 * 按住右邊的「≡」上下拖拉排序。每一列固定高度。
 * 拖拉時其他列會讓位，放開後才送出新的順序。
 */
export function SortableList<T>({ items, keyOf, rowHeight, renderRow, onReorder }: Props<T>) {
  const ids = items.map(keyOf);
  const order = useSharedValue<string[]>(ids);
  const idsKey = ids.join(',');
  useEffect(() => {
    order.set(idsKey ? idsKey.split(',') : []);
  }, [idsKey, order]);

  const commit = (next: string[]) => {
    if (next.join(',') !== idsKey) onReorder(next);
  };

  return (
    <View style={{ height: rowHeight * items.length }}>
      {items.map((item, i) => (
        <SortableRow key={keyOf(item)} id={keyOf(item)} order={order} rowHeight={rowHeight} count={items.length} onCommit={commit}>
          {renderRow(item, i)}
        </SortableRow>
      ))}
    </View>
  );
}

function SortableRow({
  id,
  order,
  rowHeight,
  count,
  onCommit,
  children,
}: {
  id: string;
  order: SharedValue<string[]>;
  rowHeight: number;
  count: number;
  onCommit: (ids: string[]) => void;
  children: ReactNode;
}) {
  const c = useTheme();
  const dragging = useSharedValue(false);
  const dragY = useSharedValue(0);
  const startIndex = useSharedValue(0);

  const haptic = tick;

  const pan = usePanGesture({
    minDistance: 0,
    onActivate: () => {
      'worklet';
      dragging.set(true);
      startIndex.set(order.get().indexOf(id));
      dragY.set(0);
      scheduleOnRN(haptic);
    },
    onUpdate: (e) => {
      'worklet';
      dragY.set(e.translationY);
      const target = Math.max(0, Math.min(count - 1, Math.round(startIndex.get() + e.translationY / rowHeight)));
      const cur = order.get().indexOf(id);
      if (target !== cur) {
        const next = order.get().slice();
        next.splice(cur, 1);
        next.splice(target, 0, id);
        order.set(next);
        scheduleOnRN(haptic);
      }
    },
    onDeactivate: () => {
      'worklet';
      dragging.set(false);
      dragY.set(0);
      scheduleOnRN(onCommit, order.get().slice());
    },
  });

  const style = useAnimatedStyle(() => {
    const index = order.get().indexOf(id);
    const top = dragging.get() ? startIndex.get() * rowHeight + dragY.get() : withSpring(index * rowHeight, { damping: 22, stiffness: 260 });
    return {
      top,
      zIndex: dragging.get() ? 10 : 0,
      shadowOpacity: dragging.get() ? 0.15 : 0,
      transform: [{ scale: dragging.get() ? 1.02 : 1 }],
    };
  });

  return (
    <Animated.View style={[styles.row, { height: rowHeight, backgroundColor: c.surface, shadowColor: '#000', shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }, style]}>
      <View style={{ flex: 1 }}>{children}</View>
      <GestureDetector gesture={pan}>
        <View accessible accessibilityLabel={tr('按住拖拉排序')} style={styles.handle}>
          <Feather name="menu" size={20} color={c.textTertiary} />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  handle: { width: 44, height: '100%', alignItems: 'center', justifyContent: 'center' },
});
