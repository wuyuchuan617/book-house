import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps, type TextProps, type ViewProps } from 'react-native';

import { Fonts, MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'title' | 'heading' | 'body' | 'caption' | 'label';

export function AppText({ variant = 'body', muted, style, ...rest }: TextProps & { variant?: Variant; muted?: boolean }) {
  const c = useTheme();
  return (
    <Text
      {...rest}
      style={[styles[variant], { color: muted ? c.textSecondary : c.text }, style]}
    />
  );
}

export function Screen({ style, ...rest }: ViewProps) {
  const c = useTheme();
  return <View {...rest} style={[{ flex: 1, backgroundColor: c.background }, style]} />;
}

export function Card({ style, ...rest }: ViewProps) {
  const c = useTheme();
  return <View {...rest} style={[{ backgroundColor: c.surface, borderRadius: Radius.xl, padding: Spacing.lg }, style]} />;
}

type ButtonProps = PressableProps & {
  label: string;
  kind?: 'primary' | 'secondary' | 'danger' | 'link';
  loading?: boolean;
};

/** S7：主要按鈕寫「做什麼」；最小觸控 44px */
export function Button({ label, kind = 'primary', loading, disabled, style, ...rest }: ButtonProps) {
  const c = useTheme();
  const bg = { primary: c.primary, secondary: c.surface, danger: c.danger, link: 'transparent' }[kind];
  const fg = { primary: c.onPrimary, secondary: c.text, danger: '#FFFFFF', link: c.primary }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      {...rest}
      style={(state) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: kind === 'secondary' ? c.border : 'transparent',
          opacity: disabled ? 0.5 : state.pressed ? 0.85 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

/** 空狀態（S3–S6）：說明原因＋一個主按鈕 */
export function EmptyState({ title, body, actionLabel, onAction }: { title: string; body: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.empty}>
      <AppText variant="heading" style={{ textAlign: 'center' }}>{title}</AppText>
      <AppText muted style={{ textAlign: 'center', marginTop: Spacing.sm, lineHeight: 22 }}>{body}</AppText>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={{ marginTop: Spacing.xl, alignSelf: 'stretch' }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700', fontFamily: Fonts?.serif },
  heading: { fontSize: 20, fontWeight: '700', fontFamily: Fonts?.serif },
  body: { fontSize: 15, lineHeight: 22 },
  caption: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '700' },
  button: {
    minHeight: 52,
    minWidth: MinTouch,
    borderRadius: Radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  buttonText: { fontSize: 15, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
});
