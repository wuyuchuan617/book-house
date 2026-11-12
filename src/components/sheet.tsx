import Feather from '@expo/vector-icons/Feather';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { AppText } from '@/components/ui';
import { MinTouch, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';

export type SheetAction = {
  label: string;
  sub?: string;
  /** 線條圖示（Feather）；危險動作沒給就用垃圾桶 */
  icon?: ComponentProps<typeof Feather>['name'];
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

/**
 * C7 更多操作（v1.6）：米色底＋白色圓角群組、每列圓底圖示＋動作＋一行說明；
 * 危險動作單獨一組放最後；不放「取消」，點背景或往下拉關閉。
 */
export function ActionSheet({ visible, title, subtitle, badge, actions, onClose }: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  /** 標題前面的類型標籤（例如「日記」） */
  badge?: ReactNode;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const c = useTheme();
  // 選了動作先收起選單，等 Modal 真的拿掉再執行（動作常會再開一個對話框，iOS 不能疊在收合中的 Modal 上）
  const [pending, setPending] = useState<(() => void) | null>(null);
  const normal = actions.filter((a) => !a.destructive);
  const danger = actions.filter((a) => a.destructive);
  const group = (list: SheetAction[]) =>
    list.length ? (
      <View style={[styles.group, { backgroundColor: c.surface }]}>
        {list.map((a, i) => {
          const fg = a.destructive ? c.danger : c.text;
          const icon = a.icon ?? (a.destructive ? 'trash-2' : undefined);
          return (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              accessibilityHint={a.sub}
              accessibilityState={{ disabled: !!a.disabled }}
              disabled={a.disabled}
              onPress={() => {
                setPending(() => a.onPress);
                onClose();
              }}
              style={({ pressed }) => [
                styles.item,
                { opacity: a.disabled ? 0.4 : pressed ? 0.6 : 1, borderBottomColor: c.divider, borderBottomWidth: i === list.length - 1 ? 0 : StyleSheet.hairlineWidth },
              ]}>
              {icon ? (
                <View style={[styles.icon, { backgroundColor: a.destructive ? c.dangerSurface : c.divider }]}>
                  <Feather name={icon} size={17} color={fg} />
                </View>
              ) : null}
              <View style={{ flex: 1, gap: 1 }}>
                <AppText style={{ fontWeight: '600', color: fg }}>{a.label}</AppText>
                {a.sub ? <AppText variant="caption" muted>{a.sub}</AppText> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    ) : null;
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onHidden={() => {
        const run = pending;
        setPending(null);
        run?.();
      }}
      style={{ paddingHorizontal: Spacing.lg, gap: 10 }}>
      {title || badge ? (
        <View style={styles.head}>
          {badge}
          <View style={{ flex: 1 }}>
            {title ? <AppText variant="label" numberOfLines={1} style={{ fontSize: 15 }}>{title}</AppText> : null}
            {subtitle ? <AppText variant="caption" muted numberOfLines={6} style={{ lineHeight: 19 }}>{subtitle}</AppText> : null}
          </View>
        </View>
      ) : null}
      {group(normal)}
      {group(danger)}
    </BottomSheet>
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
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, paddingVertical: 2 },
  group: { borderRadius: 16, overflow: 'hidden' },
  item: { minHeight: MinTouch + 12, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, backgroundColor: 'rgba(31,27,22,0.45)', justifyContent: 'center', padding: 28 },
  dialog: { borderRadius: 20, padding: Spacing.xl, maxHeight: '80%' },
});
