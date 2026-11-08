import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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
          {optional ? <AppText variant="caption" muted>{'  選填'}</AppText> : null}
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
