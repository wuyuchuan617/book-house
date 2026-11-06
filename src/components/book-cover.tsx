import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { StoreColors, type StoreColor } from '@/constants/theme';

const SIZES = { sm: 40, md: 52, lg: 80 } as const;

/** 書封 2:3。沒有封面時用店面顏色＋書名自動產生（S1 共用規則） */
export function BookCover({ title, url, color, size = 'md' }: {
  title: string;
  url?: string | null;
  color: StoreColor;
  size?: keyof typeof SIZES;
}) {
  const w = SIZES[size];
  const box = { width: w, height: Math.round(w * 1.5) };
  if (url) {
    return <Image source={{ uri: url }} style={[styles.cover, box]} contentFit="cover" accessibilityIgnoresInvertColors transition={150} />;
  }
  return (
    <View style={[styles.cover, box, styles.auto, { backgroundColor: StoreColors[color].hex }]} accessible={false}>
      <AppText style={[styles.autoText, { fontSize: size === 'lg' ? 13 : 10 }]} numberOfLines={size === 'sm' ? 3 : 4}>{title}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { borderRadius: 3, overflow: 'hidden' },
  auto: { padding: 5, justifyContent: 'flex-end' },
  autoText: { color: '#FFFFFF', fontWeight: '700', lineHeight: 13 },
});
