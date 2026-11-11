import Feather from '@expo/vector-icons/Feather';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { BookPicker } from '@/components/book-picker';
import { Chip, chipRow, TextField } from '@/components/form';
import { PlacePicker } from '@/components/place-picker';
import { AppText, Button, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Book } from '@/lib/curations';
import { userMessage } from '@/lib/errors';
import { tr } from '@/lib/i18n';
import { taipeiToday } from '@/lib/period';
import { FORMAT_LABEL, useMyPurchases, useRecordPurchase, type PurchaseFormat } from '@/lib/purchases';
import { unwrap, useMyStore } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

const COMMON_STORES = () => [tr('博客來'), tr('誠品'), tr('金石堂'), tr('讀冊')];

function useBook(id: string | undefined) {
  return useQuery({
    queryKey: ['book', id],
    enabled: !!id,
    queryFn: async () => unwrap<Book | null>(await supabase.from('books').select('id, source, title, authors, cover_url, published_year, publisher').eq('id', id!).maybeSingle()),
  });
}

const yesterday = () => {
  const d = new Date(`${taipeiToday()}T00:00:00+08:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Y13 買了一本書：在哪買（常用書店、選地點）、日期、金額（只有自己看得到）、版本、原因。
 * 存完變成積讀；勾「已經開始讀」就直接放進正在讀。
 */
export default function PurchaseScreen() {
  const { bookId } = useLocalSearchParams<{ bookId?: string }>();
  const { data: preset } = useBook(bookId);
  const c = useTheme();
  const { data: mine } = useMyStore();
  const { data: purchases } = useMyPurchases();
  const record = useRecordPurchase();
  const [book, setBook] = useState<Book | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [store, setStore] = useState('');
  const [place, setPlace] = useState<{ id: string; name: string } | null>(null);
  const [date, setDate] = useState(taipeiToday());
  const [price, setPrice] = useState('');
  const [format, setFormat] = useState<PurchaseFormat>('paper');
  const [note, setNote] = useState('');
  const [start, setStart] = useState(false);
  const [done, setDone] = useState(false);
  const chosen = book ?? preset ?? null;
  const recent = (purchases?.top_places ?? []).map((p) => p.name);
  const stores = [...new Set([...recent, ...COMMON_STORES()])].slice(0, 6);

  const dirty = !!(store || place || price || note.trim() || (!bookId && chosen));
  usePreventRemove(dirty && !done, ({ repeat }) => {
    Alert.alert(tr('放棄這次的修改？'), tr('還沒儲存的內容會不見。'), [
      { text: tr('繼續編輯'), style: 'cancel' },
      { text: tr('放棄'), style: 'destructive', onPress: repeat },
    ]);
  });

  const priceNum = price.trim() ? Number(price.replace(/[^0-9]/g, '')) : null;
  const submit = () => {
    if (!chosen) return;
    record.mutate(
      { bookId: chosen.id, boughtOn: date, placeId: place?.id ?? null, storeLabel: place ? null : store, price: priceNum, format, note, start },
      {
        onSuccess: () => {
          setDone(true);
          setTimeout(() => router.back(), 0);
        },
        onError: (e) => Alert.alert(tr('沒有存成功'), userMessage(e)),
      },
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('買了一本書') }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={chosen ? tr('已選：{title}，點兩下重選', { title: chosen.title }) : tr('選一本書')}
            disabled={!!bookId}
            onPress={() => setPickerOpen(true)}
            style={[styles.book, { backgroundColor: c.surface, borderColor: chosen ? 'transparent' : c.primary }]}>
            {chosen ? (
              <>
                <BookCover title={chosen.title} url={chosen.cover_url} color={mine?.store.color ?? 'moss'} size="sm" />
                <View style={{ flex: 1 }}>
                  <AppText variant="label" style={{ fontSize: 16 }}>{chosen.title}</AppText>
                  <AppText variant="caption" muted>{chosen.authors.join(tr('、'))}</AppText>
                </View>
                {!bookId ? <Feather name="chevron-right" size={18} color={c.textTertiary} /> : null}
              </>
            ) : (
              <>
                <Feather name="search" size={18} color={c.primary} />
                <AppText style={{ flex: 1, color: c.primary, fontWeight: '700' }}>{tr('搜尋書名、作者或掃條碼')}</AppText>
              </>
            )}
          </Pressable>

          <View style={{ gap: Spacing.sm }}>
            <AppText variant="label">
              {tr('在哪買')} <AppText variant="caption" muted>{tr('· 選填')}</AppText>
            </AppText>
            <View style={chipRow}>
              {stores.map((s) => (
                <Chip key={s} label={s} selected={!place && store === s} onPress={() => { setPlace(null); setStore(store === s ? '' : s); }} />
              ))}
              <Chip label={place ? `⌖ ${place.name}` : tr('＋ 選地點')} selected={!!place} onPress={() => setPlaceOpen(true)} />
            </View>
            {!place ? <TextField label="" accessibilityLabel={tr('在哪買')} value={store} onChangeText={(t) => setStore(t)} max={40} placeholder={tr('或自己輸入，例如：舊香居')} /> : (
              <AppText variant="caption" muted>{tr('地點頁會多算一本「在這裡買的書」（不顯示是誰）')}</AppText>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: Spacing.md }}>
            <View style={{ flex: 1, gap: Spacing.sm }}>
              <AppText variant="label">{tr('日期')}</AppText>
              <View style={chipRow}>
                <Chip label={tr('今天')} selected={date === taipeiToday()} onPress={() => setDate(taipeiToday())} />
                <Chip label={tr('昨天')} selected={date === yesterday()} onPress={() => setDate(yesterday())} />
              </View>
              <TextField label="" accessibilityLabel={tr('日期')} value={date} onChangeText={setDate} max={10} placeholder="2026-11-08" keyboardType="numbers-and-punctuation" />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label={tr('金額')} optional value={price} onChangeText={setPrice} max={6} placeholder="NT$" keyboardType="number-pad" hint={tr('只有你自己看得到')} />
            </View>
          </View>

          <View style={{ gap: Spacing.sm }}>
            <AppText variant="label">{tr('版本')}</AppText>
            <View style={chipRow}>
              {(Object.keys(FORMAT_LABEL()) as PurchaseFormat[]).map((f) => <Chip key={f} label={FORMAT_LABEL()[f]} selected={format === f} onPress={() => setFormat(f)} />)}
            </View>
          </View>

          <TextField label={tr('買下來的原因')} optional multiline max={200} value={note} onChangeText={setNote} placeholder={tr('店員推薦、翻了兩頁就想帶走…')} />

          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: start }} onPress={() => setStart(!start)} style={styles.check}>
            <View style={[styles.box, { borderColor: start ? c.primary : c.border, backgroundColor: start ? c.primary : 'transparent' }]}>
              {start ? <Feather name="check" size={14} color={c.onPrimary} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="label">{tr('已經開始讀')}</AppText>
              <AppText variant="caption" muted>{tr('不勾就先放進積讀')}</AppText>
            </View>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
      <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Button label={start ? tr('存起來，開始讀') : tr('存成積讀')} disabled={!chosen || !/^\d{4}-\d{2}-\d{2}$/.test(date)} loading={record.isPending} onPress={submit} />
      </SafeAreaView>

      <BookPicker visible={pickerOpen} mode="single" storeColor={mine?.store.color ?? 'moss'} pickedIds={new Set()} onClose={() => setPickerOpen(false)} onAdd={async (b) => setBook(b)} />
      <PlacePicker
        visible={placeOpen}
        googleOnly
        title={tr('在哪買')}
        onClose={() => setPlaceOpen(false)}
        onPick={(ch) => {
          setPlaceOpen(false);
          if (ch.kind === 'google') {
            setPlace({ id: ch.place.id, name: ch.place.name });
            setStore('');
          } else {
            setPlace(null);
            setStore(ch.label);
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  book: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, minHeight: 64 },
  check: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 48 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
