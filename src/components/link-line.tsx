import Feather from '@expo/vector-icons/Feather';
import { Linking, Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';

const host = (url: string) => {
  const m = /^https?:\/\/(?:www\.)?([^/?#]+)/i.exec(url);
  return m ? m[1] : url;
};

/** 想讀／想去存的連結：只有自己看得到；點了用瀏覽器打開 */
export function LinkLine({ url }: { url?: string | null }) {
  const c = useTheme();
  if (!url) return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={tr('打開連結 {host}', { host: host(url) })}
      accessibilityHint={tr('只有你自己看得到')}
      onPress={() => void Linking.openURL(url).catch(() => {})}
      hitSlop={6}
      style={styles.row}>
      <Feather name="link" size={12} color={c.primary} />
      <AppText variant="caption" numberOfLines={1} style={{ color: c.primary, fontWeight: '600', flexShrink: 1 }}>{host(url)}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' } });
