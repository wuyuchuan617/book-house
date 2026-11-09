import Feather from '@expo/vector-icons/Feather';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { AppText } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';

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
export function SwipeRow({ actions, children, enabled = true, background }: { actions: SwipeAction[]; children: ReactNode; enabled?: boolean; background?: string }) {
  const c = useTheme();
  return (
    <Swipeable
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
});

/** 把滑動動作掛到列上的無障礙動作 */
export function swipeA11y(actions: { label: string; onPress: () => void }[]) {
  return {
    accessibilityActions: actions.map((a) => ({ name: a.label, label: a.label })),
    onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => actions.find((a) => a.label === e.nativeEvent.actionName)?.onPress(),
  };
}
