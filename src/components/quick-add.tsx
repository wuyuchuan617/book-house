import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

function QuickAddSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
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

  const items: Item[] = [
    { key: 'want_book', icon: 'bookmark', title: tr('想讀的書'), sub: tr('書名、為什麼想讀、在哪看到、連結'), tint: c.primary, bg: c.surfaceMuted, onPress: () => router.push('/want-book') },
    { key: 'want_place', icon: 'map-pin', title: tr('想去的地點'), sub: tr('地點、為什麼想去、連結'), tint: '#2F5D6B', bg: '#E1ECEF', onPress: () => router.push({ pathname: '/diary/compose', params: { kind: 'want' } }) },
    { key: 'reading', icon: 'play', title: tr('正在讀'), sub: tr('選正在讀的書或加一本，記今天讀了什麼'), tint: c.success, bg: c.successSurface, onPress: () => router.push({ pathname: '/diary/compose', params: { kind: 'reading' } }) },
    { key: 'post', icon: 'edit-3', title: tr('日記'), sub: tr('寫字、放照片；加地點就是打卡'), tint: '#5A4B8A', bg: '#ECE8F4', onPress: () => router.push({ pathname: '/diary/compose', params: { kind: 'post' } }) },
    { key: 'curation', icon: 'grid', title: tr('新增策展'), sub: tr('放上書架，接在最後一檔之後'), tint: c.text, bg: c.surfaceMuted, onPress: newCuration },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={tr('關閉')} />
      <View style={[styles.sheet, { backgroundColor: c.background, paddingBottom: Math.max(insets.bottom, 16) + Spacing.sm }]}>
        <View style={[styles.grabber, { backgroundColor: c.border }]} />
        <View style={styles.head}>
          <AppText variant="heading" style={{ flex: 1 }}>{tr('新增')}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={tr('關閉')} onPress={onClose} style={[styles.close, { backgroundColor: c.surfaceMuted }]}>
            <Feather name="x" size={18} color={c.textSecondary} />
          </Pressable>
        </View>
        <View style={styles.grid}>
          {items.map((it) => (
            <Pressable
              key={it.key}
              accessibilityRole="button"
              accessibilityLabel={`${it.title}，${it.sub}`}
              onPress={() => go(it.key, it.onPress)}
              style={({ pressed }) => [styles.tile, { backgroundColor: c.surface, borderColor: c.divider, opacity: pressed ? 0.85 : 1 }]}>
              <View style={[styles.tileIcon, { backgroundColor: it.bg }]}>
                <Feather name={it.icon} size={18} color={it.tint} />
              </View>
              <AppText variant="label">{it.title}</AppText>
              <AppText variant="caption" muted style={{ lineHeight: 17 }} numberOfLines={2}>{it.sub}</AppText>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
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
  backdrop: { flex: 1, backgroundColor: 'rgba(31,27,22,0.45)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center' },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48.4%', borderRadius: Radius.xl, borderWidth: 1, padding: 14, gap: 6 },
  tileIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
