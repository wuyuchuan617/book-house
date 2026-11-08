import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';

type FieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  /** 顯示「7 / 24」 */
  max?: number;
  hint?: string;
  optional?: boolean;
  multiline?: boolean;
};

/** 表單欄位：標籤、字數、說明都在框外，觸控高度 ≥ 48 */
export function TextField({ label, max, hint, optional, multiline, value = '', ...rest }: FieldProps) {
  const c = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.row}>
        <AppText variant="label">
          {label}
          {optional ? <AppText variant="caption" muted>{tr('  選填')}</AppText> : null}
        </AppText>
        {max ? <AppText variant="caption" muted>{`${[...value].length} / ${max}`}</AppText> : null}
      </View>
      <TextInput
        accessibilityLabel={label}
        value={value}
        maxLength={max}
        multiline={multiline}
        placeholderTextColor={c.textTertiary}
        {...rest}
        style={[
          styles.input,
          multiline && styles.multiline,
          { borderColor: c.border, backgroundColor: c.surface, color: c.text },
        ]}
      />
      {hint ? <AppText variant="caption" muted>{hint}</AppText> : null}
    </View>
  );
}

/** 篩選／標籤／範本用的膠囊按鈕 */
export function Chip({ label, selected, onPress, disabled }: { label: string; selected?: boolean; onPress: () => void; disabled?: boolean }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? c.primary : c.surface,
          borderColor: selected ? c.primary : c.border,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
      ]}>
      <AppText variant="caption" style={{ color: selected ? c.onPrimary : c.text, fontWeight: '600' }}>{label}</AppText>
    </Pressable>
  );
}

export const chipRow = { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm } as const;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, fontSize: 16 },
  multiline: { minHeight: 104, paddingTop: 12, textAlignVertical: 'top' },
  chip: { minHeight: MinTouch - 8, paddingHorizontal: 14, borderRadius: Radius.pill, borderWidth: 1, justifyContent: 'center' },
});

/**
 * 開關：用自己的樣式取代系統 Switch（iOS 26 的系統開關尺寸和 React Native 算的不一樣，會跑版）。
 * 外框 52×32、觸控範圍 ≥ 44。
 */
export function Toggle({ value, onValueChange, accessibilityLabel, disabled }: { value: boolean; onValueChange: (v: boolean) => void; accessibilityLabel: string; disabled?: boolean }) {
  const c = useTheme();
  const [x] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    Animated.timing(x, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }, [value, x]);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onValueChange(!value)}
      style={{ opacity: disabled ? 0.5 : 1 }}>
      <Animated.View
        style={[
          toggle.track,
          { backgroundColor: x.interpolate({ inputRange: [0, 1], outputRange: [c.surfaceMuted, c.success] }) },
        ]}>
        <Animated.View style={[toggle.knob, { transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const toggle = StyleSheet.create({
  track: { width: 52, height: 32, borderRadius: 16, padding: 3, justifyContent: 'center' },
  knob: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
});
