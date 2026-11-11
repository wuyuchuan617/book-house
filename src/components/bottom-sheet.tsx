import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, Dimensions, Modal, PanResponder, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';

/**
 * v1.6 底部選單的底座：背景淡入、選單從下面滑上（不會整片黑影一起滑上來）；
 * 點背景或把選單往下拉就關閉。全 App 的底部選單都用它。
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  closeLabel,
  style,
  surface = 'background',
  handle = true,
  onHidden,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** 米色底（預設，跟設定頁同一種）或白底 */
  surface?: 'background' | 'surface';
  handle?: boolean;
  /** 收合動畫結束、Modal 拿掉之後（要接著開另一個 Modal 時用，iOS 不能疊在收合中的 Modal 上） */
  onHidden?: () => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState(visible);
  const [progress] = useState(() => new Animated.Value(0));
  const [drag] = useState(() => new Animated.Value(0));
  const [height, setHeight] = useState(() => Dimensions.get('window').height);
  // 打開時先掛上去（render 時調整 state，不放在 effect 裡）
  if (visible && !shown) setShown(true);

  useEffect(() => {
    if (visible) {
      drag.setValue(0);
      Animated.timing(progress, { toValue: 1, duration: 240, useNativeDriver: true }).start();
    } else {
      Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setShown(false);
      });
    }
  }, [visible, progress, drag]);
  const [hiddenCb, setHiddenCb] = useState<(() => void) | undefined>(undefined);
  if (hiddenCb !== onHidden) setHiddenCb(() => onHidden);
  useEffect(() => {
    if (!shown && hiddenCb) {
      const t = setTimeout(hiddenCb, 60);
      return () => clearTimeout(t);
    }
  }, [shown, hiddenCb]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > 90 || g.vy > 0.9) onClose();
          else Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        },
        onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [drag, onClose],
  );
  const translateY = useMemo(
    () => Animated.add(progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }), drag),
    [progress, drag, height],
  );

  if (!shown) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel ?? tr('關閉')} />
      </Animated.View>
      <View style={styles.bottom} pointerEvents="box-none">
        <Animated.View
          {...pan.panHandlers}
          accessibilityViewIsModal
          onLayout={(e) => setHeight(e.nativeEvent.layout.height + 40)}
          style={[
            styles.sheet,
            { backgroundColor: surface === 'surface' ? c.surface : c.background, paddingBottom: Math.max(insets.bottom, 16), transform: [{ translateY }] },
            style,
          ]}>
          {handle ? <View style={[styles.handle, { backgroundColor: c.border }]} /> : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(31,27,22,0.32)' },
  bottom: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 8,
    maxHeight: '92%',
    shadowColor: '#3C2814',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  handle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 8 },
});
