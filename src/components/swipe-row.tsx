import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { AppText } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';

export type SwipeAction = {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  onPress: () => void;
  destructive?: boolean;
};

const ACTION_W = 76;

/**
 * 往左滑露出動作（編輯、刪除）。
 * 列本身請加上 {...swipeA11y(actions)}：VoiceOver／TalkBack 使用者不用滑也能用這些動作。
 */
const HINT_KEY = 'bookhaus.swipe-hint.v1';
let hintDone = false;

export function SwipeRow({ actions, children, enabled = true, background, hint = false }: {
  actions: SwipeAction[];
  children: ReactNode;
  enabled?: boolean;
  background?: string;
  /** v1.6：第一次進列表，第一則自動往左滑開一下再收回，提示可以滑（整個 App 只示範一次） */
  hint?: boolean;
}) {
  const c = useTheme();
  const ref = useRef<SwipeableMethods>(null);
  useEffect(() => {
    if (!hint || hintDone || !enabled || !actions.length) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    AsyncStorage.getItem(HINT_KEY)
      .then((v) => {
        if (v || hintDone) return;
        hintDone = true;
        AsyncStorage.setItem(HINT_KEY, '1').catch(() => {});
        timers = [setTimeout(() => ref.current?.openRight(), 700), setTimeout(() => ref.current?.close(), 1700)];
      })
      .catch(() => {});
    return () => timers.forEach(clearTimeout);
  }, [hint, enabled, actions.length]);
  return (
    <Swipeable
      ref={ref}
      enabled={enabled && actions.length > 0}
      friction={1.6}
      rightThreshold={36}
      overshootRight={false}
      renderRightActions={(_p, _t, methods) => (
        <View style={{ flexDirection: 'row', width: ACTION_W * actions.length }}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => {
                methods.close();
                a.onPress();
              }}
              style={[styles.action, { backgroundColor: a.destructive ? c.danger : c.surfaceMuted }]}>
              <Feather name={a.icon} size={18} color={a.destructive ? '#FFFFFF' : c.text} />
              <AppText variant="caption" style={{ color: a.destructive ? '#FFFFFF' : c.text, fontWeight: '700' }}>{a.label}</AppText>
            </Pressable>
          ))}
        </View>
      )}>
      <View style={{ backgroundColor: background ?? c.surface }}>{children}</View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  action: { width: ACTION_W, alignItems: 'center', justifyContent: 'center', gap: 4 },
  more: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});

/** 把滑動動作掛到列上的無障礙動作 */
export function swipeA11y(actions: { label: string; onPress: () => void }[]) {
  return {
    accessibilityActions: actions.map((a) => ({ name: a.label, label: a.label })),
    onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => actions.find((a) => a.label === e.nativeEvent.actionName)?.onPress(),
  };
}

/** v1.6 每一則右邊的「⋯」：點了開底部選單（跟往左滑同一組動作） */
export function MoreButton({ onPress, label }: { onPress: () => void; label?: string }) {
  const c = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label ?? tr('更多動作')} hitSlop={6} onPress={onPress} style={styles.more}>
      <Feather name="more-horizontal" size={20} color={c.textSecondary} />
    </Pressable>
  );
}
