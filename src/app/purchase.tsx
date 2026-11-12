import Feather from '@expo/vector-icons/Feather';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Alert, InputAccessoryView, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { BookPicker } from '@/components/book-picker';
import { DaySheet, dayBefore } from '@/components/day-sheet';
import { Chip, Toggle } from '@/components/form';
import { PlacePicker } from '@/components/place-picker';
import { AppText, Button, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Book } from '@/lib/curations';
import { dayLabel } from '@/lib/diary';
import { userMessage } from '@/lib/errors';
import { bookTitle, tr } from '@/lib/i18n';
import { taipeiToday } from '@/lib/period';
import { FORMAT_LABEL, useMyPurchases, useRecordPurchase, type PurchaseFormat } from '@/lib/purchases';
import { unwrap, useMyStore } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

/** 依版本給常用的店：電子書是平台（不是地點），借來的是圖書館 */
const STORES = (f: PurchaseFormat): string[] =>
  f === 'ebook'
    ? ['Kobo', tr('Readmoo 讀墨'), tr('Google Play 圖書'), 'Apple Books', tr('博客來電子書'), 'Kindle']
    : f === 'used'
      ? [tr('茉莉二手書店'), tr('舊香居'), tr('博客來二手'), tr('朋友轉讓')]
      : f === 'borrowed'
        ? [tr('圖書館'), tr('朋友')]
        : [tr('博客來'), tr('誠品'), tr('金石堂'), tr('讀冊')];

const FORMATS: PurchaseFormat[] = ['paper', 'ebook', 'used', 'borrowed'];
const AMOUNT_BAR = 'purchase-amount';

function useBook(id: string | undefined) {
  return useQuery({
    queryKey: ['book-row', id],
    enabled: !!id,
    queryFn: async () => unwrap<Book | null>(await supabase.from('books').select('id, source, title, authors, cover_url, published_year, publisher').eq('id', id!).maybeSingle()),
  });
}

/**
 * Y13／v1.7.1 Z1 買了一本書：跟設定頁同一種分組白卡。
 * 版本（紙本／電子書／二手／借來的）放最上面，「在哪買」跟著換：電子書是平台（Kobo、Readmoo…），不能選地點。
 * 日期開 Z1b 月曆；金額在那一列直接輸入（Z1c）；原因是大一點的輸入框；「已經開始讀」是開關。
 */
export default function PurchaseScreen() {
  const { bookId, from } = useLocalSearchParams<{ bookId?: string; from?: string }>();
  const { data: preset } = useBook(bookId);
  const c = useTheme();
  const { data: mine } = useMyStore();
  const { data: purchases } = useMyPurchases();
  const record = useRecordPurchase();
  const [book, setBook] = useState<Book | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [amountFocus, setAmountFocus] = useState(false);
  const [store, setStore] = useState('');
  const [place, setPlace] = useState<{ id: string; name: string } | null>(null);
  const [date, setDate] = useState(taipeiToday());
  const [price, setPrice] = useState('');
  const [format, setFormat] = useState<PurchaseFormat>('paper');
  const [note, setNote] = useState('');
  const [start, setStart] = useState(false);
  const [done, setDone] = useState(false);
  const chosen = book ?? preset ?? null;
  const isEbook = format === 'ebook';
  const recent = isEbook ? [] : (purchases?.top_places ?? []).map((p) => p.name);
  const stores = [...new Set([...recent, ...STORES(format)])].slice(0, 6);
  const today = taipeiToday();
  const dateText = date === today ? tr('今天 {d}', { d: dayLabel(date) }) : date === dayBefore(today) ? tr('昨天 {d}', { d: dayLabel(date) }) : dayLabel(date);

  const dirty = !!(store || place || price || note.trim() || (!bookId && chosen));
  usePreventRemove(dirty && !done, ({ repeat }) => {
    Alert.alert(tr('放棄這次的修改？'), tr('還沒儲存的內容會不見。'), [
      { text: tr('繼續編輯'), style: 'cancel' },
      { text: tr('放棄'), style: 'destructive', onPress: repeat },
    ]);
  });

  const pickFormat = (f: PurchaseFormat) => {
    setFormat(f);
    // 電子書不是地點：換過去就把選好的地點拿掉；店名不在新清單裡也清掉
    if (f === 'ebook') setPlace(null);
    if (store && !STORES(f).includes(store) && !custom) setStore('');
  };

  const priceNum = price.trim() ? Number(price.replace(/[^0-9]/g, '')) : null;
  const submit = () => {
    if (!chosen) return;
    record.mutate(
      { bookId: chosen.id, boughtOn: date, placeId: place?.id ?? null, storeLabel: place ? null : store.trim(), price: priceNum, format, note, start },
      {
        onSuccess: () => {
          setDone(true);
          setTimeout(() => router.back(), 0);
        },
        onError: (e) => Alert.alert(tr('沒有存成功'), userMessage(e)),
      },
    );
  };

  const where = place ? place.name : store;

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('買了一本書') }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.sm, paddingBottom: 32 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={chosen ? tr('已選：{title}，點兩下重選', { title: chosen.title }) : tr('選一本書')}
            disabled={!!bookId}
            onPress={() => setPickerOpen(true)}
            style={[styles.book, !chosen && { backgroundColor: c.surface, borderWidth: 1, borderColor: c.primary, padding: Spacing.md }]}>
            {chosen ? (
              <>
                <BookCover title={chosen.title} url={chosen.cover_url} color={mine?.store.color ?? 'moss'} size="md" />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="title" style={{ fontSize: 19, lineHeight: 26 }}>{bookTitle(chosen.title)}</AppText>
                  <AppText variant="caption" muted>{[chosen.authors.join(tr('、')), from === 'want' ? tr('從想讀移過來') : null].filter(Boolean).join(' · ')}</AppText>
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

          <View style={[styles.segment, { backgroundColor: c.surfaceMuted, marginTop: Spacing.md }]} accessibilityRole="radiogroup">
            {FORMATS.map((f) => (
              <Pressable key={f} accessibilityRole="radio" accessibilityState={{ selected: format === f }} onPress={() => pickFormat(f)} style={[styles.segmentItem, format === f && { backgroundColor: c.surface }]}>
                <AppText variant="caption" style={{ fontWeight: '700', color: format === f ? c.text : c.textSecondary }}>{FORMAT_LABEL()[f]}</AppText>
              </Pressable>
            ))}
          </View>

          <Label>{isEbook ? tr('在哪個平台買') : format === 'borrowed' ? tr('跟誰借') : tr('在哪買')}</Label>
          <Group>
            {!isEbook ? (
              <Row
                icon={place ? 'map-pin' : 'home'}
                title={where || tr('選地點')}
                sub={place ? tr('地點 · 地點頁會多算一本（不顯示是誰）') : where ? tr('沒有選地點') : tr('選了地點，地點頁會多算一本')}
                muted={!where}
                onPress={() => setPlaceOpen(true)}
                right={<Feather name="chevron-right" size={16} color={c.textTertiary} />}
              />
            ) : null}
            <View style={[styles.chips, !isEbook && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
              {stores.map((s) => (
                <Chip key={s} label={s} selected={!place && !custom && store === s} onPress={() => { setPlace(null); setCustom(false); setStore(store === s && !custom ? '' : s); }} />
              ))}
              <Chip label={tr('＋ 自己輸入')} selected={custom} onPress={() => { setPlace(null); setCustom(true); setStore(''); }} />
            </View>
            {custom ? (
              <View style={[styles.inputRow, { borderTopColor: c.divider }]}>
                <TextInput
                  autoFocus
                  value={store}
                  onChangeText={setStore}
                  maxLength={40}
                  placeholder={isEbook ? tr('平台名稱，例如：Pubu') : tr('店名，例如：舊香居')}
                  placeholderTextColor={c.textTertiary}
                  accessibilityLabel={tr('在哪買')}
                  style={{ flex: 1, fontSize: 16, color: c.text, minHeight: MinTouch }}
                />
              </View>
            ) : null}
          </Group>

          <Label>{tr('細節')}</Label>
          <Group>
            <Row icon="calendar" title={tr('日期')} onPress={() => setDateOpen(true)} right={<><AppText>{dateText}</AppText><Feather name="chevron-right" size={16} color={c.textTertiary} /></>} />
            <View style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }, amountFocus && { backgroundColor: c.divider }]}>
              <View style={[styles.rowIcon, { backgroundColor: c.surfaceMuted }]}><Feather name="dollar-sign" size={15} color={c.text} /></View>
              <View style={{ flex: 1 }}>
                <AppText>{tr('金額')}</AppText>
                <AppText variant="caption" muted>{tr('只有你看得到')}</AppText>
              </View>
              <AppText muted>NT$</AppText>
              <TextInput
                value={price}
                onChangeText={(t) => setPrice(t.replace(/[^0-9]/g, '').slice(0, 6))}
                onFocus={() => setAmountFocus(true)}
                onBlur={() => setAmountFocus(false)}
                keyboardType="number-pad"
                inputAccessoryViewID={Platform.OS === 'ios' ? AMOUNT_BAR : undefined}
                placeholder={tr('選填')}
                placeholderTextColor={c.textTertiary}
                accessibilityLabel={tr('金額')}
                style={[styles.amount, { color: c.text, borderColor: amountFocus ? c.primary : 'transparent' }]}
              />
            </View>
          </Group>

          <Label>{tr('買下來的原因')}</Label>
          <View style={[styles.reason, { backgroundColor: c.surface }]}>
            <TextInput
              multiline
              value={note}
              onChangeText={setNote}
              maxLength={200}
              placeholder={tr('店員推薦、翻了兩頁就想帶走…')}
              placeholderTextColor={c.textTertiary}
              accessibilityLabel={tr('買下來的原因')}
              style={{ flex: 1, fontSize: 16, lineHeight: 23, color: c.text, minHeight: 84, textAlignVertical: 'top' }}
            />
            <AppText variant="caption" muted style={{ textAlign: 'right' }}>{`${[...note].length} / 200`}</AppText>
          </View>

          <View style={{ height: Spacing.sm }} />
          <Group>
            <Row icon="book-open" title={tr('已經開始讀')} sub={tr('不打開就放進積讀')} onPress={() => setStart(!start)} right={<Toggle value={start} onValueChange={setStart} accessibilityLabel={tr('已經開始讀')} />} />
          </Group>
        </ScrollView>
      </KeyboardAvoidingView>
      <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Button label={start ? tr('存起來，開始讀') : tr('存成積讀')} disabled={!chosen} loading={record.isPending} onPress={submit} />
      </SafeAreaView>

      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={AMOUNT_BAR}>
          <View style={[styles.bar, { backgroundColor: c.surfaceMuted }]}>
            <Pressable accessibilityRole="button" onPress={() => Keyboard.dismiss()} hitSlop={10} style={{ minHeight: MinTouch, justifyContent: 'center' }}>
              <AppText style={{ color: c.primary, fontWeight: '700' }}>{tr('完成')}</AppText>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}

      <DaySheet key={String(dateOpen)} visible={dateOpen} title={tr('哪一天買的？')} value={date} onChange={setDate} onClose={() => setDateOpen(false)} />
      <BookPicker visible={pickerOpen} mode="single" storeColor={mine?.store.color ?? 'moss'} pickedIds={new Set()} onClose={() => setPickerOpen(false)} onAdd={async (b) => setBook(b)} />
      <PlacePicker
        visible={placeOpen}
        googleOnly
        title={tr('在哪買')}
        onClose={() => setPlaceOpen(false)}
        onPick={(ch) => {
          setPlaceOpen(false);
          setCustom(false);
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

function Label({ children }: { children: ReactNode }) {
  return (
    <AppText variant="caption" muted style={{ paddingHorizontal: 4, marginTop: Spacing.md }}>
      {children}
    </AppText>
  );
}

function Group({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <View style={[styles.group, { backgroundColor: c.surface }]}>{children}</View>;
}

function Row({ icon, title, sub, right, onPress, muted }: { icon: ComponentProps<typeof Feather>['name']; title: string; sub?: string; right?: ReactNode; onPress: () => void; muted?: boolean }) {
  const c = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: c.surfaceMuted }]}><Feather name={icon} size={15} color={c.text} /></View>
      <View style={{ flex: 1 }}>
        <AppText style={muted ? { color: c.primary, fontWeight: '700' } : undefined}>{title}</AppText>
        {sub ? <AppText variant="caption" muted>{sub}</AppText> : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  book: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, borderRadius: Radius.lg, minHeight: 64 },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 36, borderRadius: 9 },
  group: { borderRadius: Radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, minHeight: 56 },
  rowIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, padding: Spacing.md },
  inputRow: { paddingHorizontal: Spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  amount: { width: 96, flexGrow: 0, flexShrink: 0, height: 38, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, fontSize: 17, fontWeight: '700', textAlign: 'right' },
  reason: { borderRadius: Radius.lg, padding: Spacing.lg, gap: 4 },
  bar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: Spacing.lg },
  footer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
