import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { Toggle } from '@/components/form';
import { AppText, Button, Screen } from '@/components/ui';
import { MinTouch, Spacing, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { tr } from '@/lib/i18n';
import { storeLinkLabel } from '@/lib/links';
import { shareViewAsImage, useWeekPhotoUrls, weekLabel, type WeekReview } from '@/lib/weekly';

const BG = '#2B2520';
const INK = '#F3EFE8';
const SOFT = '#CFC5B7';
const ACCENT = '#E8A07E';

/**
 * W4 分享圖：9:16，在手機上畫好再轉成圖片，不上傳。
 * 預設只有天數＋書封＋一則金句；照片、地點要自己打開；有開店可以加書店連結。
 */
export function WeekShareSheet({ visible, onClose, week, store }: {
  visible: boolean;
  onClose: () => void;
  week: WeekReview;
  store?: { name: string; slug: string; color: StoreColor } | null;
}) {
  const c = useTheme();
  const card = useRef<React.ComponentRef<typeof View>>(null);
  const [withPhotos, setWithPhotos] = useState(false);
  const [withPlaces, setWithPlaces] = useState(false);
  const [withStore, setWithStore] = useState(!!store);
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      await shareViewAsImage(card.current);
      track('weekly_review_shared', { photos: withPhotos, places: withPlaces, store: withStore && !!store, books: Math.min(week.books.length, 4), quote: !!week.quotes[0] });
    } catch (e) {
      Alert.alert(tr('沒有分享成功'), (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
          <View style={[styles.bar, { borderBottomColor: c.divider }]}>
            <View style={{ width: 64 }} />
            <AppText variant="label" style={{ fontSize: 16 }}>{tr('分享我的一週')}</AppText>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.barBtn}>
              <AppText style={{ color: c.primary, fontWeight: '600' }}>{tr('關閉')}</AppText>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg, alignItems: 'center' }}>
            <View ref={card} collapsable={false}>
              <WeekShareCard week={week} withPhotos={withPhotos} withPlaces={withPlaces} store={withStore ? store : null} />
            </View>
            <View style={{ alignSelf: 'stretch', gap: Spacing.sm }}>
              <OptionRow label={tr('放照片')} value={withPhotos} onChange={setWithPhotos} disabled={!week.photos.length} />
              <OptionRow label={tr('放去過的地方')} value={withPlaces} onChange={setWithPlaces} disabled={!week.places.length} />
              {store ? <OptionRow label={tr('放書店連結')} value={withStore} onChange={setWithStore} /> : null}
              <AppText variant="caption" muted>{tr('圖片在手機上產生，不會上傳。')}</AppText>
            </View>
          </ScrollView>
          <View style={{ paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm }}>
            <Button label={tr('分享圖片')} loading={busy} onPress={() => void share()} />
          </View>
        </SafeAreaView>
      </Screen>
    </Modal>
  );
}

function OptionRow({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const c = useTheme();
  return (
    <View style={[styles.option, { backgroundColor: c.surface, opacity: disabled ? 0.5 : 1 }]}>
      <AppText variant="label" style={{ flex: 1 }}>{label}</AppText>
      <Toggle accessibilityLabel={label} value={value && !disabled} disabled={disabled} onValueChange={onChange} />
    </View>
  );
}

/** 圖卡本身（270×480，轉圖時依手機解析度放大） */
export function WeekShareCard({ week, withPhotos, withPlaces, store }: {
  week: WeekReview;
  withPhotos: boolean;
  withPlaces: boolean;
  store?: { name: string; slug: string; color: StoreColor } | null;
}) {
  const photos = useWeekPhotoUrls(withPhotos ? week.photos.slice(0, 3) : undefined);
  const quote = week.quotes.find((q) => q.kind === 'quote') ?? week.quotes[0];
  const color: StoreColor = store?.color ?? 'clay';
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Image source={require('@/assets/images/icon.png')} style={{ width: 20, height: 20, borderRadius: 5 }} />
        <AppText style={{ color: INK, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>{tr('書棲 Bookhaus')}</AppText>
        <View style={{ flex: 1 }} />
        <AppText style={{ color: SOFT, fontSize: 11 }}>{weekLabel(week.week_start)}</AppText>
      </View>

      <View style={{ marginTop: 22, gap: 8 }}>
        <AppText style={{ color: SOFT, fontSize: 12 }}>{tr('這一週，我讀了')}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
          <AppText style={{ color: ACCENT, fontSize: 44, fontWeight: '800', lineHeight: 48 }}>{week.counts.active_days}</AppText>
          <AppText style={{ color: INK, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>{tr('天')}</AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {week.days.map((d) => (
            <View key={d.day} style={[styles.dot, { backgroundColor: d.active ? ACCENT : 'transparent', borderColor: d.active ? ACCENT : 'rgba(255,255,255,0.3)' }]} />
          ))}
        </View>
      </View>

      {week.books.length ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
          {week.books.slice(0, 4).map((b) => (
            <BookCover key={b.id} title={b.title} url={b.cover_url} color={color} size="md" />
          ))}
        </View>
      ) : null}

      {quote ? (
        <View style={{ marginTop: 18, borderLeftWidth: 2, borderLeftColor: ACCENT, paddingLeft: 10, gap: 4 }}>
          <AppText numberOfLines={5} style={{ color: INK, fontFamily: 'serif', fontSize: 13, lineHeight: 20 }}>
            {quote.kind === 'quote' ? tr('「{body}」', { body: quote.body }) : quote.body}
          </AppText>
          <AppText numberOfLines={1} style={{ color: SOFT, fontSize: 10 }}>{tr('——《{title}》', { title: quote.book_title })}</AppText>
        </View>
      ) : null}

      {withPhotos && week.photos.length ? (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 16 }}>
          {week.photos.slice(0, 3).map((p, i) => (
            <Image key={p.path} source={photos.data?.[i] ? { uri: photos.data[i]! } : undefined} style={styles.photo} contentFit="cover" />
          ))}
        </View>
      ) : null}

      {withPlaces && week.places.length ? (
        <View style={{ marginTop: 14, gap: 3 }}>
          {week.places.slice(0, 3).map((p) => (
            <View key={p.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Feather name="map-pin" size={10} color={ACCENT} />
              <AppText numberOfLines={1} style={{ color: INK, fontSize: 11, flex: 1 }}>{p.name}</AppText>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ flex: 1 }} />
      <AppText style={{ color: SOFT, fontSize: 10 }}>{store ? tr('{name} · {link}', { name: store.name, link: storeLinkLabel(store.slug) }) : tr('用書棲記下每天讀的書')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  barBtn: { width: 64, minHeight: MinTouch, alignItems: 'flex-end', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: 14, paddingHorizontal: Spacing.lg, minHeight: 56 },
  card: { width: 270, height: 480, borderRadius: 18, backgroundColor: BG, padding: 20, overflow: 'hidden' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  photo: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#3A332B' },
});
