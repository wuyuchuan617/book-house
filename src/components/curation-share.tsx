import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { Chip, chipRow } from '@/components/form';
import { StoreAvatar } from '@/components/social';
import { AppText, Button, Screen } from '@/components/ui';
import { Fonts, MinTouch, Spacing, StoreColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { useCuration } from '@/lib/curations';
import { tr } from '@/lib/i18n';
import { shareStore, storeLinkLabel } from '@/lib/links';
import { monthOf } from '@/lib/period';
import { useMyStore } from '@/lib/queries';
import { shareViewAsImage } from '@/lib/weekly';

/**
 * v1.9 AL3 策展分享圖卡：書店顏色底、月份、標題、一句介紹、前三本書封、書店名與連結。
 * 直式（限時動態 9:16）或方形（貼文）；在手機上畫好再轉成圖片，不上傳。
 */
export function CurationShareSheet({ curationId, visible, onClose }: { curationId: string | undefined; visible: boolean; onClose: () => void }) {
  const c = useTheme();
  const { data: cur } = useCuration(visible ? curationId : undefined);
  const { data: mine } = useMyStore();
  const card = useRef<React.ComponentRef<typeof View>>(null);
  const [shape, setShape] = useState<'story' | 'square'>('story');
  const [busy, setBusy] = useState(false);
  const store = mine?.store;

  const share = async () => {
    setBusy(true);
    try {
      await shareViewAsImage(card.current);
      track('curation_card_shared', { shape });
    } catch (e) {
      Alert.alert(tr('沒有分享成功'), (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const items = [...(cur?.curation_items ?? [])].sort((a, b) => a.position - b.position);
  const bg = store ? StoreColors[store.color]?.hex ?? StoreColors.moss.hex : StoreColors.moss.hex;
  const W = 250;
  const H = shape === 'story' ? Math.round((W * 16) / 9) : W;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
          <View style={[styles.bar, { borderBottomColor: c.divider }]}>
            <View style={{ width: 64 }} />
            <AppText variant="label" style={{ fontSize: 16 }}>{tr('分享策展')}</AppText>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.barBtn}>
              <AppText style={{ color: c.primary, fontWeight: '600' }}>{tr('關閉')}</AppText>
            </Pressable>
          </View>
          {!cur || !store ? (
            <ActivityIndicator style={{ marginTop: 48 }} />
          ) : (
            <>
              <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg, alignItems: 'center' }}>
                <View ref={card} collapsable={false}>
                  <View style={[styles.card, { width: W, height: H, backgroundColor: bg }]}>
                    <AppText style={styles.month}>{tr('{m} 月策展', { m: monthOf(cur.period) })}</AppText>
                    <AppText style={[styles.title, { fontFamily: Fonts?.serif, fontSize: shape === 'story' ? 24 : 20, lineHeight: shape === 'story' ? 32 : 27 }]} numberOfLines={shape === 'story' ? 4 : 2}>{cur.title ?? ''}</AppText>
                    {cur.description ? <AppText style={styles.desc} numberOfLines={shape === 'story' ? 4 : 2}>{cur.description}</AppText> : null}
                    <View style={{ flex: 1 }} />
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {items.slice(0, 3).map((it) => <BookCover key={it.id} title={it.books.title} url={it.books.cover_url} color={store.color} size={shape === 'story' ? 'md' : 'sm'} />)}
                      {items.length > 3 ? <AppText style={[styles.desc, { alignSelf: 'flex-end' }]}>{`+${items.length - 3}`}</AppText> : null}
                    </View>
                    <View style={styles.foot}>
                      <StoreAvatar name={store.name} color={store.color} size={22} path={store.avatar_path} />
                      <View style={{ flex: 1 }}>
                        <AppText style={{ color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '700' }} numberOfLines={1}>{store.name}</AppText>
                        <AppText style={{ color: '#FFFFFF', opacity: 0.85, fontSize: 10, lineHeight: 13 }} numberOfLines={1}>{storeLinkLabel(store.slug)}</AppText>
                      </View>
                      <AppText style={{ color: '#FFFFFF', opacity: 0.9, fontSize: 10, lineHeight: 14, fontWeight: '700' }}>{tr('書棲')}</AppText>
                    </View>
                  </View>
                </View>
                <View style={chipRow}>
                  <Chip label={tr('直式・限時動態')} selected={shape === 'story'} onPress={() => setShape('story')} />
                  <Chip label={tr('方形・貼文')} selected={shape === 'square'} onPress={() => setShape('square')} />
                </View>
                <AppText variant="caption" muted style={{ textAlign: 'center' }}>{tr('圖片在手機上產生，不會上傳。分享選單裡可以選「儲存影像」。')}</AppText>
              </ScrollView>
              <View style={{ paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.sm }}>
                <Button label={tr('分享圖片')} loading={busy} onPress={() => void share()} />
                <Button kind="secondary" label={tr('分享書店連結')} onPress={() => shareStore(store.name, store.slug)} />
              </View>
            </>
          )}
        </SafeAreaView>
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  barBtn: { width: 64, minHeight: MinTouch, alignItems: 'flex-end', justifyContent: 'center' },
  card: { borderRadius: 18, padding: 18, overflow: 'hidden' },
  month: { color: '#FFFFFF', opacity: 0.85, fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 1 },
  title: { color: '#FFFFFF', fontWeight: '700', marginTop: 6 },
  desc: { color: '#FFFFFF', opacity: 0.9, fontSize: 12, lineHeight: 18, marginTop: 6 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.4)' },
});
