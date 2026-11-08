import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Alert, Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components/ui';
import { MinTouch, Radius, Spacing, StoreColors, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useFollowIds, useSaveIds, useToggleFollow, useToggleSave } from '@/lib/browse';
import { storageUrl } from '@/lib/uploads';
import { userMessage } from '@/lib/errors';

/** 書店頭像：沒有上傳圖片時用店面顏色＋店名第一個字 */
export function StoreAvatar({ name, color, size = 40, path }: { name: string; color: StoreColor; size?: number; path?: string | null }) {
  const uri = storageUrl('avatar', path);
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size * 0.28 }} accessibilityIgnoresInvertColors contentFit="cover" />;
  }
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: StoreColors[color].hex }]}>
      <AppText style={{ color: '#FFFFFF', fontWeight: '700', fontSize: size * 0.42 }}>{[...name][0] ?? '書'}</AppText>
    </View>
  );
}

/** 追蹤／追蹤中；訪客按下會先跳登入引導（A9），登入後自動完成追蹤 */
export function FollowButton({ bookstoreId, storeName, onColor }: { bookstoreId: string; storeName: string; onColor?: boolean }) {
  const c = useTheme();
  const { requireAuth } = useAuth();
  const { data: ids } = useFollowIds();
  const toggle = useToggleFollow();
  const following = !!ids?.has(bookstoreId);

  const press = () =>
    requireAuth(() => {
      if (!following) return toggle.mutate({ bookstoreId, follow: true }, { onError: (e) => Alert.alert('沒有成功', userMessage(e)) });
      Alert.alert(`取消追蹤「${storeName}」？`, '之後新策展上架時不會再通知你。', [
        { text: '繼續追蹤', style: 'cancel' },
        { text: '取消追蹤', style: 'destructive', onPress: () => toggle.mutate({ bookstoreId, follow: false }) },
      ]);
    });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: following }}
      accessibilityLabel={following ? `已追蹤${storeName}，點兩下取消追蹤` : `追蹤${storeName}`}
      onPress={press}
      style={({ pressed }) => [
        styles.follow,
        following
          ? { backgroundColor: 'transparent', borderColor: onColor ? '#FFFFFF' : c.border }
          : { backgroundColor: onColor ? '#FFFFFF' : c.primary, borderColor: 'transparent' },
        { opacity: pressed ? 0.8 : 1 },
      ]}>
      <AppText
        variant="caption"
        style={{ fontWeight: '700', color: following ? (onColor ? '#FFFFFF' : c.text) : onColor ? c.text : c.onPrimary }}>
        {following ? '追蹤中' : '＋ 追蹤'}
      </AppText>
    </Pressable>
  );
}

/** 收藏這本書（書籤圖示），記下是從哪檔策展／哪間書店收藏的 */
export function SaveButton({ bookId, title, curationId, bookstoreId, withLabel }: {
  bookId: string;
  title: string;
  curationId?: string | null;
  bookstoreId?: string | null;
  withLabel?: boolean;
}) {
  const c = useTheme();
  const { requireAuth } = useAuth();
  const { data: ids } = useSaveIds();
  const toggle = useToggleSave();
  const saved = !!ids?.has(bookId);
  const press = () =>
    requireAuth(() =>
      toggle.mutate({ bookId, save: !saved, curationId, bookstoreId }, { onError: (e) => Alert.alert('沒有成功', userMessage(e)) }),
    );

  if (withLabel) {
    return <Button kind={saved ? 'secondary' : 'primary'} label={saved ? '✓ 在想讀清單' : '加入想讀'} onPress={press} />;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      accessibilityLabel={saved ? `從想讀移除「${title}」` : `加入想讀「${title}」`}
      onPress={press}
      hitSlop={6}
      style={styles.save}>
      <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? c.primary : c.textTertiary} />
    </Pressable>
  );
}

/** 底部提示＋「復原」（B2 取消收藏、R7 刪除共用），5 秒後自動消失 */
export function UndoToast({ message, onUndo, onHide }: { message: string | null; onUndo: () => void; onHide: () => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    const t = setTimeout(onHide, 5000);
    return () => clearTimeout(t);
  }, [message, onHide, opacity]);

  if (!message) return null;
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[styles.toast, { opacity, backgroundColor: c.text, bottom: Math.max(insets.bottom, 12) + 8 }]}>
      <AppText style={{ color: c.background, flex: 1 }} numberOfLines={2}>{message}</AppText>
      <Pressable accessibilityRole="button" onPress={onUndo} style={styles.undo}>
        <AppText style={{ color: c.background, fontWeight: '700', textDecorationLine: 'underline' }}>復原</AppText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  follow: { minHeight: MinTouch - 8, minWidth: 76, paddingHorizontal: 14, borderRadius: Radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  save: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: Spacing.lg, right: Spacing.lg, borderRadius: Radius.lg, paddingLeft: Spacing.lg, flexDirection: 'row', alignItems: 'center', minHeight: 52 },
  undo: { minHeight: MinTouch, minWidth: MinTouch, paddingHorizontal: Spacing.lg, justifyContent: 'center' },
});
