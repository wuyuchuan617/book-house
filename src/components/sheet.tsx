import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components/ui';
import { MinTouch, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';

export type SheetAction = {
  label: string;
  sub?: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

/** C7 更多操作：底部選單，最後一個是「取消」 */
export function ActionSheet({ visible, title, subtitle, actions, onClose }: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={tr('關閉')} />
      <View style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: Math.max(insets.bottom, 16) }]}>
        {title ? (
          <View style={[styles.head, { borderBottomColor: c.divider }]}>
            <AppText variant="label" style={{ fontSize: 15 }}>{title}</AppText>
            {subtitle ? <AppText variant="caption" muted>{subtitle}</AppText> : null}
          </View>
        ) : null}
        {actions.map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!a.disabled }}
            disabled={a.disabled}
            onPress={() => {
              onClose();
              a.onPress();
            }}
            style={({ pressed }) => [styles.item, { opacity: a.disabled ? 0.4 : pressed ? 0.6 : 1, borderBottomColor: c.divider }]}>
            <AppText style={{ fontWeight: '600', color: a.destructive ? c.danger : c.text }}>{a.label}</AppText>
            {a.sub ? <AppText variant="caption" muted>{a.sub}</AppText> : null}
          </Pressable>
        ))}
        <Button kind="secondary" label={tr('取消')} onPress={onClose} style={{ marginTop: Spacing.md, marginHorizontal: Spacing.lg }} />
      </View>
    </Modal>
  );
}

/** 置中對話框（C8 刪除確認等） */
export function Dialog({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const c = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.center}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={tr('關閉')} />
        <View style={[styles.dialog, { backgroundColor: c.surface }]}>
          <ScrollView contentContainerStyle={{ gap: Spacing.md }}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(31,27,22,0.45)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: Spacing.sm },
  head: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  item: { minHeight: MinTouch + 12, paddingHorizontal: Spacing.xl, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  center: { flex: 1, backgroundColor: 'rgba(31,27,22,0.45)', justifyContent: 'center', padding: 28 },
  dialog: { borderRadius: 20, padding: Spacing.xl, maxHeight: '80%' },
});
