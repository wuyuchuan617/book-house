import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { tr } from '@/lib/i18n';
import { useInbox } from '@/lib/store-v16';

/** v1.6 圖示按鈕：34px 圓底＋線條圖示（跟底部選單同一套） */
export function IconButton({ icon, label, onPress, onImage }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void; onImage?: boolean }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={5}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, { backgroundColor: onImage ? 'rgba(255,255,255,0.92)' : c.surface, opacity: pressed ? 0.75 : 1 }]}>
      <Feather name={icon} size={18} color={onImage ? '#1F1B16' : c.text} />
    </Pressable>
  );
}

/** 鈴鐺：4 個分頁右上都有；有未讀時右上角一個小紅點 */
export function NotificationBell({ onImage }: { onImage?: boolean }) {
  const c = useTheme();
  const { session, requireAuth } = useAuth();
  const { data } = useInbox();
  const unread = session ? (data?.unread ?? 0) : 0;
  return (
    <View>
      <IconButton
        icon="bell"
        label={unread ? tr('通知，{n} 則未讀', { n: unread }) : tr('通知')}
        onImage={onImage}
        onPress={() => requireAuth(() => router.push('/notifications'))}
      />
      {unread ? <View pointerEvents="none" style={[styles.dot, { backgroundColor: c.danger, borderColor: onImage ? '#FFFFFF' : c.background }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: -1, right: -1, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
});
