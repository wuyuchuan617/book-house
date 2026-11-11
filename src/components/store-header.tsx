import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StoreAvatar } from '@/components/social';
import { AppText } from '@/components/ui';
import { Radius, Spacing, StoreColors, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { storageUrl } from '@/lib/uploads';

/**
 * v1.7.2 AA1／AA5 精簡的書店資訊（我的書店、書店頁共用）：
 * 背景圖只到狀態列下 72pt；頭像 60 壓在圖下緣，名字和簡介移到圖下面；
 * 下面一行左邊是追蹤數（meta），右邊是動作（actions）。
 */
export function StoreHeader({ store, buttons, meta, actions }: {
  store: { name: string; tagline: string | null; color: StoreColor; avatar_path: string | null; banner_path: string | null };
  /** 背景圖上的圓底按鈕 */
  buttons: ReactNode;
  meta: ReactNode;
  actions: ReactNode;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const banner = storageUrl('banner', store.banner_path);
  return (
    <View>
      <View style={{ height: insets.top + 72, backgroundColor: StoreColors[store.color].hex }}>
        {banner ? <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.12)' }]} />}
        <View style={[styles.buttons, { top: insets.top + 8 }]}>{buttons}</View>
      </View>
      <View style={styles.identity}>
        <View style={[styles.avatarRing, { borderColor: c.background, backgroundColor: c.background }]}>
          <StoreAvatar name={store.name} color={store.color} size={60} path={store.avatar_path} />
        </View>
        <View style={{ flex: 1, minHeight: 44, paddingTop: 6 }}>
          <AppText variant="title" numberOfLines={1} style={{ fontSize: 20, lineHeight: 27 }}>{store.name}</AppText>
          {store.tagline ? <AppText variant="caption" muted numberOfLines={2}>{store.tagline}</AppText> : null}
        </View>
      </View>
      <View style={styles.metaRow}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flexWrap: 'wrap' }}>{meta}</View>
        {actions}
      </View>
    </View>
  );
}

/** 「38 追蹤者」：一行字，可以點 */
export function CountLink({ n, label, onPress }: { n: number; label: string; onPress?: () => void }) {
  const c = useTheme();
  return (
    <Pressable accessibilityRole={onPress ? 'link' : undefined} accessibilityLabel={`${n} ${label}`} disabled={!onPress} onPress={onPress} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, minHeight: 32, paddingVertical: 6 }}>
      <AppText style={{ fontWeight: '700', fontSize: 14 }}>{String(n)}</AppText>
      <AppText variant="caption" style={{ color: c.textSecondary }}>{label}</AppText>
    </Pressable>
  );
}

/** 小按鈕：有字（編輯）或只有圖示（讀者視角、分享） */
export function SmallButton({ icon, label, showLabel, onPress }: { icon: ComponentProps<typeof Feather>['name']; label: string; showLabel?: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.small, showLabel ? { paddingHorizontal: 12 } : { width: 34 }, { borderColor: c.border, backgroundColor: c.surface, opacity: pressed ? 0.8 : 1 }]}>
      <Feather name={icon} size={15} color={c.text} />
      {showLabel ? <AppText variant="caption" style={{ fontWeight: '700' }}>{label}</AppText> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  buttons: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', gap: 8 },
  identity: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, alignItems: 'flex-start' },
  avatarRing: { borderWidth: 3, borderRadius: 19, marginTop: -30 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  small: { height: 34, borderRadius: Radius.pill, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
});
