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
      { key: 'reading', icon: 'play', title: tr('正在讀'), sub: tr('記今天讀到哪、讀了什麼'), tint: c.success, bg: c.successSurface, onPress: () => router.push('/reading/compose') },
      { key: 'want_book', icon: 'bookmark', title: tr('想讀'), sub: tr('想讀的書'), tint: c.primary, bg: c.surfaceMuted, onPress: () => router.push('/want-book') },
      { key: 'want_place', icon: 'map-pin', title: tr('想去'), sub: tr('想去的地點'), tint: '#2F5D6B', bg: '#E1ECEF', onPress: () => router.push({ pathname: '/diary/compose', params: { kind: 'want' } }) },
      { key: 'purchase', icon: 'shopping-bag', title: tr('買了書'), sub: tr('買了一本書'), tint: '#8B6A1F', bg: '#F9EEDA', onPress: () => router.push('/purchase') },
      { key: 'event', icon: 'calendar', title: tr('活動'), sub: tr('分享活動'), tint: '#9A4A12', bg: '#FBEBDD', onPress: () => router.push('/event/share') },
      { key: 'trip', icon: 'compass', title: tr('書旅'), sub: tr('整理書旅'), tint: '#2E5A87', bg: '#E4ECF5', onPress: () => router.push('/trip/edit') },
      { key: 'rx', icon: 'message-circle', title: tr('處方箋'), sub: tr('閱讀處方箋'), tint: '#5A4B8A', bg: '#ECE8F4', onPress: () => router.push('/rx/new') },
      { key: 'curation', icon: 'grid', title: tr('策展'), sub: tr('新增策展'), tint: c.text, bg: c.surfaceMuted, onPress: newCuration },
    ] as Item[]).map((it) => [it.key, it]),
  );

  // v1.8.1 AJ1：最常用的兩個做成長條；其他分兩組、圓角圖示＋兩三個字
  const bar = (it: Item) => (
    <Pressable
      key={it.key}
      accessibilityRole="button"
      accessibilityLabel={`${it.title}，${it.sub}`}
      onPress={() => go(it.key, it.onPress)}
      style={({ pressed }) => [styles.bar, { backgroundColor: it.key === 'post' ? c.primary : c.surface, borderColor: it.key === 'post' ? c.primary : c.divider, opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.barIcon, { backgroundColor: it.key === 'post' ? 'rgba(255,255,255,0.2)' : it.bg }]}>
        <Feather name={it.icon} size={18} color={it.key === 'post' ? c.onPrimary : it.tint} />
      </View>
      <AppText variant="label" style={{ color: it.key === 'post' ? c.onPrimary : c.text, flexShrink: 1 }} numberOfLines={1}>{it.title}</AppText>
    </Pressable>
  );
  const icon = (it: Item) => (
    <Pressable key={it.key} accessibilityRole="button" accessibilityLabel={it.sub} onPress={() => go(it.key, it.onPress)} style={({ pressed }) => [styles.iconTile, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.iconBox, { backgroundColor: it.bg }]}>
        <Feather name={it.icon} size={22} color={it.tint} />
      </View>
      <AppText variant="caption" style={{ fontWeight: '700', color: c.text }} numberOfLines={1}>{it.title}</AppText>
    </Pressable>
  );
  const group = (label: string, keys: string[]) => (
    <View style={{ gap: Spacing.sm }}>
      <AppText variant="caption" muted style={{ fontWeight: '700' }}>{label}</AppText>
      <View style={styles.icons}>{keys.map((k) => icon(items[k]))}</View>
    </View>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} style={styles.sheet}>
        <View style={styles.head}>
          <AppText variant="heading" style={{ flex: 1 }}>{tr('新增')}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={tr('關閉')} onPress={onClose} style={[styles.close, { backgroundColor: c.surfaceMuted }]}>
            <Feather name="x" size={18} color={c.textSecondary} />
          </Pressable>
        </View>
        {/* v1.8.2 AK9：最常用的離拇指最近——分享最上面、收藏中間、寫日記｜正在讀最下面同一行 */}
        {group(tr('分享給大家'), ['event', 'trip', 'rx', 'curation'])}
        {group(tr('收藏'), ['want_book', 'want_place', 'purchase'])}
        <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs }}>{['post', 'reading'].map((k) => bar(items[k]))}</View>
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
  bar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.xl, borderWidth: 1, paddingHorizontal: 12, minHeight: 58 },
  barIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  icons: { flexDirection: 'row' },
  iconTile: { width: '25%', alignItems: 'center', gap: 6, minHeight: 76 },
  iconBox: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
