import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { BookPicker } from '@/components/book-picker';
import { Chip, TextField, Toggle } from '@/components/form';
import { VisibilityBadge } from '@/components/diary';
import { PlacePicker, type PlaceChoice } from '@/components/place-picker';
import { AppText, Button, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSavedBooks } from '@/lib/browse';
import type { Book } from '@/lib/curations';
import {
  categoryIcon,
  categoryLabel,
  dayLabel,
  DIARY_BODY_MAX,
  DIARY_PHOTO_MAX,
  diaryError,
  useDiaryDay,
  useDiaryImageUrls,
  useIndieVote,
  useSaveEntry,
  type DiaryEntry,
  type DiaryPhoto,
  type PlaceCategory,
} from '@/lib/diary';
import { tr } from '@/lib/i18n';
import { taipeiToday } from '@/lib/period';
import { useMyStore } from '@/lib/queries';
import { useMyReadings, useSaveNote } from '@/lib/readings';

type MiniBook = { id: string; title: string; cover_url: string | null };

/**
 * D2 記一筆／D3 打卡（只能記今天）。書（選填）→ 地點（打卡）→ 一句話 → 照片 → 底部儲存。
 * 打卡選了公開場所才能公開；公開後立刻出現在地點頁，只顯示日期。
 */
type Params = { kind?: 'note' | 'checkin'; entryId?: string; placeId?: string; placeName?: string; googlePlaceId?: string; publicOk?: string; category?: PlaceCategory };

export default function DiaryComposeScreen() {
  const params = useLocalSearchParams<Params>();
  const day = useDiaryDay();
  const existing = params.entryId ? (day.data?.items.find((i) => (i.type === 'note' || i.type === 'checkin') && i.id === params.entryId) as DiaryEntry | undefined) : undefined;
  if (params.entryId && day.isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (params.entryId && !existing) return <EmptyState title={tr('只能編輯今天的日記')} body={tr('過了當天的日記可以刪除，但不能修改。')} />;
  return <ComposeForm params={params} existing={existing} />;
}

function initialPlace(params: Params, e?: DiaryEntry): PlaceChoice | null {
  if (e?.place_id && e.place_name && e.google_place_id) {
    return { kind: 'google', place: { id: e.place_id, name: e.place_name, address: e.place_address, category: e.place_category ?? 'other', public_ok: !!e.place_public_ok, google_place_id: e.google_place_id } };
  }
  if (e?.place_label) return { kind: 'label', label: e.place_label };
  if (!e && params.placeId && params.placeName && params.googlePlaceId) {
    return { kind: 'google', place: { id: params.placeId, name: params.placeName, address: null, category: params.category ?? 'other', public_ok: params.publicOk === '1', google_place_id: params.googlePlaceId } };
  }
  return null;
}

function ComposeForm({ params, existing }: { params: Params; existing?: DiaryEntry }) {
  const c = useTheme();
  const today = taipeiToday();
  const { data: store } = useMyStore();
  const readings = useMyReadings();
  const saves = useSavedBooks();
  const save = useSaveEntry();
  const saveNote = useSaveNote();
  const indieVote = useIndieVote();
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<'note' | 'checkin'>(existing?.type ?? (params.kind === 'checkin' ? 'checkin' : 'note'));
  const [book, setBook] = useState<MiniBook | null>(existing?.book ?? null);
  const [place, setPlace] = useState<PlaceChoice | null>(() => initialPlace(params, existing));
  const [body, setBody] = useState(existing?.body ?? '');
  const [photos, setPhotos] = useState<DiaryPhoto[]>(() => (existing?.photo_paths ?? []).map((path) => ({ path })));
  const [isPublic, setIsPublic] = useState(existing?.is_public ?? false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [alsoNote, setAlsoNote] = useState(false);
  const [indie, setIndie] = useState(false);
  const autoOpened = useRef(false);

  // 從「打卡」進來：直接打開選地點
  useEffect(() => {
    if (params.kind !== 'checkin' || params.entryId || params.placeId || autoOpened.current) return;
    autoOpened.current = true;
    const t = setTimeout(() => setPlaceOpen(true), 400);
    return () => clearTimeout(t);
  }, [params.kind, params.entryId, params.placeId]);

  const { data: signed } = useDiaryImageUrls(existing?.photo_paths);

  const quickBooks = useMemo(() => {
    const seen = new Set<string>();
    const reading = (readings.data ?? []).filter((r) => r.status === 'reading').map((r) => r.books);
    const want = (saves.data ?? []).map((s) => s.books);
    return [...reading.map((b) => ({ b, reading: true })), ...want.map((b) => ({ b, reading: false }))]
      .filter(({ b }) => (seen.has(b.id) ? false : (seen.add(b.id), true)))
      .slice(0, 6);
  }, [readings.data, saves.data]);

  // 日記筆記選了店主閱讀裡的書：可以同時存成那本書的心得（跟著那本書的公開設定）
  const linkedReading = kind === 'note' && !existing && book ? readings.data?.find((r) => r.books.id === book.id) : undefined;
  const isBookstore = kind === 'checkin' && place?.kind === 'google' && place.place.category === 'bookstore';

  const canPublic = kind === 'checkin' && place?.kind === 'google' && place.place.public_ok;
  const publicOn = canPublic && isPublic;

  const dirty = existing
    ? body !== (existing.body ?? '') || book?.id !== existing.book?.id || kind !== existing.type || photos.length !== existing.photo_paths.length || photos.some((p) => 'uri' in p) || publicOn !== existing.is_public || placeKey(place) !== (existing.place_id ?? existing.place_label ?? '')
    : !!(body.trim() || photos.length || book || place);

  usePreventRemove(dirty && !done, ({ repeat }) => {
    Alert.alert(tr('捨棄這筆日記？'), tr('還沒儲存的內容會不見。'), [
      { text: tr('繼續寫'), style: 'cancel' },
      { text: tr('捨棄'), style: 'destructive', onPress: repeat },
    ]);
  });

  const addPhoto = async (source: 'camera' | 'library') => {
    const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert(source === 'camera' ? tr('需要使用相機') : tr('需要讀取照片'), tr('可以到手機設定開啟權限。'));
    const left = DIARY_PHOTO_MAX - photos.length;
    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: true, selectionLimit: left });
    if (res.canceled) return;
    setPhotos((p) => [...p, ...res.assets.slice(0, left).map((a) => ({ uri: a.uri, mimeType: a.mimeType }))]);
  };
  const pickPhoto = () =>
    Alert.alert(tr('加入照片'), undefined, [
      { text: tr('拍照'), onPress: () => void addPhoto('camera') },
      { text: tr('從相簿選'), onPress: () => void addPhoto('library') },
      { text: tr('取消'), style: 'cancel' },
    ]);

  const ready = kind === 'checkin' ? !!place : !!(body.trim() || photos.length);
  const submit = async () => {
    setBusy(true);
    try {
      let readingNoteId: string | null = null;
      if (linkedReading && alsoNote && body.trim()) {
        const r = await saveNote.mutateAsync({
          readingId: linkedReading.id,
          input: { kind: 'thought', body, photos: photos.filter((p) => 'uri' in p), fromScan: false },
        });
        readingNoteId = r.id;
      }
      await save.mutateAsync({
        entryId: existing?.id,
        previousPaths: existing?.photo_paths,
        input: {
          kind,
          bookId: book?.id ?? null,
          body,
          placeId: place?.kind === 'google' ? place.place.id : null,
          placeLabel: place?.kind === 'label' ? place.label : null,
          photos,
          isPublic: !!publicOn,
          readingNoteId,
        },
      });
      if (isBookstore && indie && place?.kind === 'google') await indieVote.mutateAsync({ placeId: place.place.id, vote: true }).catch(() => {});
      setDone(true);
      setTimeout(() => router.back(), 0);
    } catch (e) {
      Alert.alert(tr('沒有儲存成功'), diaryError((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? tr('編輯日記') : kind === 'checkin' ? tr('打卡') : tr('寫日記') }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText variant="caption" muted>{tr('今天 · {date}', { date: dayLabel(today) })}</AppText>
            <VisibilityBadge v={publicOn ? { public: true, where: 'place' } : { public: false }} />
          </View>

          <View style={[styles.segment, { backgroundColor: c.surfaceMuted }]} accessibilityRole="radiogroup">
            {(['note', 'checkin'] as const).map((k) => (
              <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected: kind === k }} onPress={() => setKind(k)} style={[styles.segmentItem, kind === k && { backgroundColor: c.surface }]}>
                <Feather name={k === 'note' ? 'edit-3' : 'map-pin'} size={14} color={kind === k ? c.text : c.textSecondary} />
                <AppText variant="caption" style={{ fontWeight: '700', color: kind === k ? c.text : c.textSecondary }}>{k === 'note' ? tr('日記') : tr('打卡')}</AppText>
              </Pressable>
            ))}
          </View>

          <AppText variant="caption" muted style={{ marginTop: -Spacing.sm }}>
            {kind === 'note' ? tr('日記只有自己看得到。') : tr('打卡預設只有自己看得到；在公開場所可以選擇公開到地點頁。')}
          </AppText>

          {kind === 'checkin' ? (
            <View style={{ gap: Spacing.sm }}>
              <AppText variant="label">{tr('地點')}</AppText>
              <Pressable accessibilityRole="button" onPress={() => setPlaceOpen(true)} style={[styles.field, { backgroundColor: c.surface, borderColor: place ? c.border : c.primary }]}>
                <Feather name={place?.kind === 'google' ? categoryIcon(place.place.category) : place ? 'edit-3' : 'map-pin'} size={18} color={place ? c.text : c.primary} />
                <View style={{ flex: 1 }}>
                  <AppText variant="label" style={{ color: place ? c.text : c.primary }} numberOfLines={1}>
                    {place ? (place.kind === 'google' ? place.place.name : place.label) : tr('選一個地點')}
                  </AppText>
                  {place ? (
                    <AppText variant="caption" muted numberOfLines={1}>
                      {place.kind === 'google' ? [place.place.category !== 'other' ? categoryLabel(place.place.category) : null, place.place.address].filter(Boolean).join(' · ') || tr('Google 地點') : tr('自己輸入的地點')}
                    </AppText>
                  ) : null}
                </View>
                <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{place ? tr('更換') : ''}</AppText>
              </Pressable>

              <View style={[styles.switchRow, { backgroundColor: c.surface, opacity: canPublic ? 1 : 0.6 }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label">{tr('公開在地點頁')}</AppText>
                  <AppText variant="caption" muted>
                    {!place
                      ? tr('選了公開場所（書店、圖書館、咖啡店…）就能分享給其他人。')
                      : place.kind === 'label'
                        ? tr('自己輸入的地點只有自己看得到。')
                        : !place.place.public_ok
                          ? tr('這裡看起來是私人地點，只會留在自己的日記裡。')
                          : publicOn
                            ? tr('其他人會在「{name}」的地點頁看到這則打卡，只顯示日期。', { name: place.place.name })
                            : tr('只有自己看得到。')}
                  </AppText>
                </View>
                <Toggle accessibilityLabel={tr('公開在地點頁')} value={!!publicOn} disabled={!canPublic} onValueChange={setIsPublic} />
              </View>
              {isBookstore && !existing ? (
                <Check checked={indie} onPress={() => setIndie(!indie)} label={tr('這是獨立書店')} sub={tr('2 個人以上標記，就會顯示成獨立書店。')} />
              ) : null}
            </View>
          ) : null}

          <View style={{ gap: Spacing.sm }}>
            <AppText variant="label">
              {tr('書')}
              <AppText variant="caption" muted>{tr('  選填')}</AppText>
            </AppText>
            {book ? (
              <View style={[styles.field, { backgroundColor: c.surface, borderColor: c.border }]}>
                <BookCover title={book.title} url={book.cover_url} color={store?.store.color ?? 'moss'} size="sm" />
                <AppText variant="label" style={{ flex: 1 }} numberOfLines={2}>{book.title}</AppText>
                <Pressable accessibilityRole="button" accessibilityLabel={tr('移除這本書')} hitSlop={8} onPress={() => setBook(null)} style={styles.iconBtn}>
                  <Feather name="x" size={18} color={c.textSecondary} />
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
                {quickBooks.map(({ b, reading }) => (
                  <Chip key={b.id} label={`${reading ? tr('在讀 · ') : ''}${b.title.length > 14 ? `${b.title.slice(0, 14)}…` : b.title}`} onPress={() => setBook(b)} />
                ))}
                <Chip label={tr('＋ 其他書')} onPress={() => setBookOpen(true)} />
              </View>
            )}
          </View>

          <TextField
            label={kind === 'checkin' ? tr('一句話') : tr('今天讀了什麼？')}
            optional={kind === 'checkin' || photos.length > 0}
            multiline
            max={DIARY_BODY_MAX}
            value={body}
            onChangeText={setBody}
            placeholder={kind === 'checkin' ? tr('在這裡讀了什麼、遇見什麼') : tr('一句話就好')}
          />
          {linkedReading ? (
            <Check
              checked={alsoNote}
              onPress={() => setAlsoNote(!alsoNote)}
              label={tr('也存成這本書的心得')}
              sub={linkedReading.is_public ? tr('這本書公開在書店頁，讀者會看到這則心得（想法）。') : tr('存成「想法」，只有自己看得到。')}
            />
          ) : existing?.reading_note_id ? (
            <AppText variant="caption" muted>{tr('這則也存成了心得；要修改心得請到這本書的頁面。')}</AppText>
          ) : null}

          <View style={{ gap: Spacing.sm }}>
            <AppText variant="label">
              {tr('照片')}
              <AppText variant="caption" muted>{publicOn ? tr('  最多 {n} 張 · 會跟著打卡公開', { n: DIARY_PHOTO_MAX }) : tr('  最多 {n} 張', { n: DIARY_PHOTO_MAX })}</AppText>
            </AppText>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              {photos.map((p, i) => {
                const uri = 'uri' in p ? p.uri : signed?.[existing?.photo_paths.indexOf(p.path) ?? -1] ?? undefined;
                return (
                  <View key={'uri' in p ? p.uri : p.path}>
                    <Image source={uri ? { uri } : undefined} style={[styles.photo, { backgroundColor: c.surfaceMuted }]} contentFit="cover" accessibilityLabel={tr('日記的照片 {n}', { n: i + 1 })} />
                    <Pressable accessibilityRole="button" accessibilityLabel={tr('移除這張照片')} hitSlop={8} onPress={() => setPhotos((ps) => ps.filter((_, j) => j !== i))} style={styles.remove}>
                      <Feather name="x" size={14} color="#FFFFFF" />
                    </Pressable>
                  </View>
                );
              })}
              {photos.length < DIARY_PHOTO_MAX ? (
                <Pressable accessibilityRole="button" accessibilityLabel={tr('加入照片')} onPress={pickPhoto} style={[styles.photo, styles.addPhoto, { borderColor: c.border }]}>
                  <Feather name="camera" size={20} color={c.textSecondary} />
                  <AppText variant="caption" muted>{tr('照片')}</AppText>
                </Pressable>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Button label={publicOn ? tr('儲存並公開') : tr('儲存')} disabled={!ready} loading={busy} onPress={() => void submit()} />
      </SafeAreaView>

      <PlacePicker
        visible={placeOpen}
        onClose={() => setPlaceOpen(false)}
        onPick={(choice) => {
          setPlaceOpen(false);
          setPlace(choice);
          if (choice.kind === 'label' || !choice.place.public_ok) setIsPublic(false);
        }}
      />
      <BookPicker
        visible={bookOpen}
        mode="single"
        storeColor={store?.store.color ?? 'moss'}
        pickedIds={new Set()}
        onClose={() => setBookOpen(false)}
        onAdd={async (b: Book) => setBook(b)}
      />
    </Screen>
  );
}

function Check({ checked, onPress, label, sub }: { checked: boolean; onPress: () => void; label: string; sub?: string }) {
  const c = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: MinTouch }}>
      <Feather name={checked ? 'check-square' : 'square'} size={20} color={checked ? c.primary : c.textSecondary} />
      <View style={{ flex: 1 }}>
        <AppText variant="label">{label}</AppText>
        {sub ? <AppText variant="caption" muted>{sub}</AppText> : null}
      </View>
    </Pressable>
  );
}

const placeKey = (p: PlaceChoice | null) => (!p ? '' : p.kind === 'google' ? p.place.id : p.label);

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', borderRadius: Radius.md, padding: 3 },
  segmentItem: { flex: 1, minHeight: MinTouch - 4, borderRadius: Radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  field: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, minHeight: 56, paddingVertical: Spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg },
  iconBtn: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center', marginRight: -Spacing.sm },
  photo: { width: 84, height: 84, borderRadius: 10 },
  addPhoto: { borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2 },
  remove: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(31,27,22,0.8)', alignItems: 'center', justifyContent: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
});
