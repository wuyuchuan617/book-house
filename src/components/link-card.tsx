import Feather from '@expo/vector-icons/Feather';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { linkHost, linkPlatform, type LinkPlatform } from '@/lib/diary-link';
import { tr } from '@/lib/i18n';

const LOOK: Record<LinkPlatform, { icon: React.ComponentProps<typeof Feather>['name']; fg: string; bg: string; label: () => string }> = {
  youtube: { icon: 'play-circle', fg: '#C4302B', bg: '#FBE7E6', label: () => 'YouTube' },
  spotify: { icon: 'headphones', fg: '#1D8A4A', bg: '#E2F3E8', label: () => 'Spotify' },
  apple_podcasts: { icon: 'mic', fg: '#7A3FA0', bg: '#F1E6F7', label: () => 'Podcast' },
  podcast: { icon: 'mic', fg: '#7A3FA0', bg: '#F1E6F7', label: () => 'Podcast' },
  web: { icon: 'file-text', fg: '#2E5A87', bg: '#E4ECF5', label: () => tr('文章') },
};

export const openLink = (url: string) => void WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => {}));

/** v1.8.4 AK22 日記的連結小卡：平台圖示、標題（抓不到就用網域）、平台 · 網域；點了用 App 內瀏覽器打開。onRemove 有給就顯示 ✕（寫日記時） */
export function LinkCard({ url, title, onRemove, loading }: { url: string; title?: string | null; onRemove?: () => void; loading?: boolean }) {
  const c = useTheme();
  const look = LOOK[linkPlatform(url)];
  const host = linkHost(url);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={tr('打開連結：{title}', { title: title || host })}
      onPress={() => openLink(url)}
      style={({ pressed }) => [styles.card, { backgroundColor: c.background, opacity: pressed ? 0.8 : 1 }]}>
      <View style={[styles.icon, { backgroundColor: look.bg }]}>
        <Feather name={look.icon} size={18} color={look.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="label" numberOfLines={1} style={{ fontSize: 14 }}>{title || (loading ? tr('讀取標題…') : host)}</AppText>
        <AppText variant="caption" muted numberOfLines={1} style={{ fontSize: 11.5 }}>{`${look.label()} · ${host}`}</AppText>
      </View>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={tr('拿掉連結')} hitSlop={10} onPress={onRemove} style={styles.x}>
          <Feather name="x" size={17} color={c.textSecondary} />
        </Pressable>
      ) : (
        <Feather name="external-link" size={15} color={c.textTertiary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 8 },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  x: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
