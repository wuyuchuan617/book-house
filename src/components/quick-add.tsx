import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { AppText } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { friendlyError, useCreateCuration, useSuggestedPeriod } from '@/lib/curations';
import { currentPeriod, lastOpenPeriod } from '@/lib/period';
import { tr } from '@/lib/i18n';

type Icon = React.ComponentProps<typeof Feather>['name'];
type Item = { key: string; icon: Icon; title: string; sub: string; tint: string; bg: string; onPress: () => void };

/** F1 每個分頁右下角的＋（分頁列上方）；按了開 F2 新增選單。訪客按下先請登入 */
export function QuickAddButton({ bottom }: { bottom: number }) {
  const c = useTheme();
  const { requireAuth } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('新增')}
        onPress={() => requireAuth(() => {
          track('fab_opened');
          setOpen(true);
        })}
        style={({ pressed }) => [styles.fab, { bottom, backgroundColor: c.primary, opacity: pressed ? 0.9 : 1 }]}>
        <Feather name="plus" size={28} color={c.onPrimary} />
      </Pressable>
      <QuickAddSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function QuickAddSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useTheme();
  const { data: suggested } = useSuggestedPeriod();
  const create = useCreateCuration();

  const go = (key: string, fn: () => void) => {
    track('fab_item', { item: key });
    onClose();
    setTimeout(fn, 250);
  };
  const newCuration = () => {
    const target = suggested ?? currentPeriod();
    if (target > lastOpenPeriod()) return Alert.alert(tr('已經排到 4 個月後了'), tr('策展最多可以排到本月起 4 個月內。'));
    create.mutate(
      { period: target },
      { onSuccess: (r) => router.push({ pathname: '/curation/[id]', params: { id: r.id } }), onError: (e) => Alert.alert(tr('沒有成功'), friendlyError(e.message)) },
    );
  };

  const items: Record<string, Item> = Object.fromEntries(
    ([
      { key: 'post', icon: 'edit-3', title: tr('寫日記'), sub: tr('寫字、放照片；加地點就是打卡'), tint: '#5A4B8A', bg: '#ECE8F4', onPress: () => router.push({ pathname: '/diary/compose', params: { kind: 'post' } }) },
      { key: 'reading', icon: 'play', title: tr('正在讀'), sub: tr('記讀到哪'), tint: c.success, bg: c.successSurface, onPress: () => router.push('/reading/compose') },
      { key: 'want_book', icon: 'bookmark', title: tr('想讀'), sub: tr('存一本書'), tint: c.primary, bg: c.surfaceMuted, onPress: () => router.push('/want-book') },
      { key: 'want_place', icon: 'map-pin', title: tr('想去'), sub: tr('存一個地點'), tint: '#2F5D6B', bg: '#E1ECEF', onPress: () => router.push({ pathname: '/diary/compose', params: { kind: 'want' } }) },
      { key: 'purchase', icon: 'shopping-bag', title: tr('買了書'), sub: tr('放進積讀'), tint: '#8B6A1F', bg: '#F9EEDA', onPress: () => router.push('/purchase') },
      { key: 'event', icon: 'calendar', title: tr('分享活動'), sub: tr('市集、簽書會'), tint: '#9A4A12', bg: '#FBEBDD', onPress: () => router.push('/event/share') },
      { key: 'trip', icon: 'compass', title: tr('整理書旅'), sub: tr('一個城市的路線'), tint: '#2E5A87', bg: '#E4ECF5', onPress: () => router.push('/trip/edit') },
      { key: 'rx', icon: 'message-circle', title: tr('處方箋'), sub: tr('請大家推薦'), tint: '#5A4B8A', bg: '#ECE8F4', onPress: () => router.push('/rx/new') },
      { key: 'curation', icon: 'grid', title: tr('新增策展'), sub: tr('下個月的書單'), tint: c.text, bg: c.surfaceMuted, onPress: newCuration },
    ] as Item[]).map((it) => [it.key, it]),
  );

  // v1.8.3 AK18：兩欄小卡（圖示＋名稱＋一句說明）；最下面一顆大的「寫日記」，離拇指最近
  const tile = (it: Item) => (
    <Pressable
      key={it.key}
      accessibilityRole="button"
      accessibilityLabel={`${it.title}，${it.sub}`}
      onPress={() => go(it.key, it.onPress)}
      style={({ pressed }) => [styles.tile, { backgroundColor: c.surface, opacity: pressed ? 0.8 : 1 }]}>
      <View style={[styles.tileIcon, { backgroundColor: it.bg }]}>
        <Feather name={it.icon} size={18} color={it.tint} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="label" numberOfLines={1}>{it.title}</AppText>
        <AppText variant="caption" muted numberOfLines={1} style={{ fontSize: 11.5 }}>{it.sub}</AppText>
      </View>
    </Pressable>
  );
  const post = items.post;

  return (
    <BottomSheet visible={visible} onClose={onClose} style={styles.sheet}>
        <View style={styles.head}>
          <AppText variant="heading" style={{ flex: 1 }}>{tr('新增')}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={tr('關閉')} onPress={onClose} style={[styles.close, { backgroundColor: c.surfaceMuted }]}>
            <Feather name="x" size={18} color={c.textSecondary} />
          </Pressable>
        </View>
        <View style={styles.grid}>{['reading', 'want_book', 'want_place', 'purchase', 'event', 'trip', 'rx', 'curation'].map((k) => tile(items[k]))}</View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${post.title}，${post.sub}`}
          onPress={() => go(post.key, post.onPress)}
          style={({ pressed }) => [styles.write, { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 }]}>
          <View style={[styles.tileIcon, { backgroundColor: 'rgba(255,255,255,0.2)', width: 40, height: 40 }]}>
            <Feather name={post.icon} size={19} color={c.onPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="label" style={{ color: c.onPrimary, fontSize: 16 }}>{post.title}</AppText>
            <AppText variant="caption" style={{ color: c.onPrimary, opacity: 0.85 }} numberOfLines={1}>{post.sub}</AppText>
          </View>
          <Feather name="chevron-right" size={18} color={c.onPrimary} />
        </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#502814',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  sheet: { paddingHorizontal: Spacing.xl, gap: Spacing.md },
  head: { flexDirection: 'row', alignItems: 'center' },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.sm },
  tile: { width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.lg, paddingHorizontal: 12, minHeight: 58 },
  tileIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  write: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.xl, paddingHorizontal: 14, minHeight: 62, marginTop: Spacing.xs },
});
