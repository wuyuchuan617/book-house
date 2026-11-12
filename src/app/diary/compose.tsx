import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
  PLACE_CATEGORIES,
  PLACE_NOTE_MAX,
  useMyPlaceSave,
  useSaveEntry,
  useSavePlace,
  useSetPlaceType,
  type DiaryEntry,
  type DiaryPhoto,
  type PlaceCategory,
} from '@/lib/diary';
import { bookTitle, tr } from '@/lib/i18n';
import { taipeiToday } from '@/lib/period';
import { useMyStore } from '@/lib/queries';
import { useAddReading, useMyReadings, useSaveNote, useUpdateReading, type ReadingStatus } from '@/lib/readings';

type MiniBook = { id: string; title: string; cover_url: string | null };

/**
 * v1.5 ＋選單的三種（只能記今天）：
 * 日記貼文（F6）：文字＋照片＋選填地點（有地點＝打卡）、只有自己／公開。
 * 正在讀（F5）：選正在讀的書或其他書（自動加入正在讀）、讀到第幾頁、還在讀／讀完了、今天讀了什麼、照片。
 * 想去（F4）：Google 地點、為什麼想去、連結、類型、顯示在書店頁。
 */
type Kind = 'post' | 'reading' | 'want';
type Params = {
  /** 舊的 note／checkin 都當成日記貼文（checkin 會直接打開選地點） */
  kind?: Kind | 'note' | 'checkin';
  entryId?: string;
  placeId?: string;
  placeName?: string;
  googlePlaceId?: string;
  publicOk?: string;
  category?: PlaceCategory;
  /** 想去：編輯時帶入原本的原因、我選的類型；saved = '1' 表示已經存過（可以移除） */
  note?: string;
  type?: PlaceCategory;
  saved?: string;
  /** 正在讀：先選好這本 */
  bookId?: string;
};

export default function DiaryComposeScreen() {
  const params = useLocalSearchParams<Params>();
  const day = useDiaryDay();
  const editingWant = params.kind === 'want' && params.saved === '1' && !!params.placeId;
  const wantRow = useMyPlaceSave(editingWant ? params.placeId : undefined);
  if (editingWant && wantRow.isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  const existing = params.entryId ? (day.data?.items.find((i) => (i.type === 'note' || i.type === 'checkin') && i.id === params.entryId) as DiaryEntry | undefined) : undefined;
  if (params.entryId && day.isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (params.entryId && !existing) return <EmptyState title={tr('只能編輯今天的日記')} body={tr('過了當天的日記可以刪除，但不能修改。')} />;
  return <ComposeForm params={params} existing={existing} wantRow={wantRow.data ?? undefined} />;
}

function initialPlace(params: Params, e?: DiaryEntry): PlaceChoice | null {
  if (e?.place_id && e.place_name && e.google_place_id) {
    return { kind: 'google', place: { id: e.place_id, name: e.place_name, address: e.place_address, category: e.place_category ?? null, public_ok: !!e.place_public_ok, google_place_id: e.google_place_id } };
  }
  if (e?.place_label) return { kind: 'label', label: e.place_label };
  if (!e && params.placeId && params.placeName && params.googlePlaceId) {
    return { kind: 'google', place: { id: params.placeId, name: params.placeName, address: null, category: params.category ?? null, public_ok: params.publicOk === '1', google_place_id: params.googlePlaceId } };
  }
  return null;
}

function initialKind(params: Params, e?: DiaryEntry): Kind {
  if (e) return e.book && !e.place_id && !e.place_label ? 'reading' : 'post';
  if (params.kind === 'reading' || params.kind === 'want') return params.kind;
  return 'post';
}

function ComposeForm({ params, existing, wantRow }: { params: Params; existing?: DiaryEntry; wantRow?: { note: string | null; link: string | null; is_public: boolean } }) {
  const c = useTheme();
  const today = taipeiToday();
  const { data: store } = useMyStore();
  const readings = useMyReadings();
  const save = useSaveEntry();
  const saveNote = useSaveNote();
  const savePlace = useSavePlace();
  const setPlaceType = useSetPlaceType();
  const addReading = useAddReading();
  const updateReading = useUpdateReading();
  const [busy, setBusy] = useState(false);

  const kind = initialKind(params, existing);
  const [pickedBook, setBook] = useState<MiniBook | null>(existing?.book ?? null);
  const [place, setPlace] = useState<PlaceChoice | null>(() => initialPlace(params, existing));
  const [body, setBody] = useState(existing?.body ?? '');
  const [pageRef, setPageRef] = useState(existing?.page_ref ?? '');
  const [photos, setPhotos] = useState<DiaryPhoto[]>(() => (existing?.photo_paths ?? []).map((path) => ({ path })));
  const [isPublic, setIsPublic] = useState<boolean | null>(existing ? existing.is_public : wantRow ? wantRow.is_public : null);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [done, setDone] = useState(false);
  // 正在讀：預設也存成這本書的心得（不想要再取消）
  const [alsoNote, setAlsoNote] = useState(true);
  const [finished, setFinished] = useState(false);
  const [placeType, setPlaceTypeState] = useState<PlaceCategory | null>(params.type ?? null);
  const [wantNote, setWantNote] = useState(wantRow?.note ?? params.note ?? '');
  const [wantLink, setWantLink] = useState<string | null>(wantRow?.link ?? null);
  const editingWant = kind === 'want' && params.saved === '1';
  const autoOpened = useRef(false);

  // 從「打卡」或「想去」進來：直接打開選地點
  useEffect(() => {
    if ((params.kind !== 'checkin' && params.kind !== 'want') || params.entryId || params.placeId || autoOpened.current) return;
    autoOpened.current = true;
    const t = setTimeout(() => setPlaceOpen(true), 400);
    return () => clearTimeout(t);
  }, [params.kind, params.entryId, params.placeId]);

  const { data: signed } = useDiaryImageUrls(existing?.photo_paths);

  const nowReading = (readings.data ?? []).filter((r) => r.status === 'reading');
  // 正在讀：還沒選書時先選第一本正在讀的（或從這本書頁進來的那本）
  const preset = kind === 'reading' && !existing ? (params.bookId ? readings.data?.find((r) => r.books.id === params.bookId)?.books : nowReading[0]?.books) : undefined;
  const book: MiniBook | null = pickedBook ?? (preset ? { id: preset.id, title: preset.title, cover_url: preset.cover_url } : null);
  const linkedReading = book ? readings.data?.find((r) => r.books.id === book.id) : undefined;

  const googlePlace = place?.kind === 'google' ? place.place : null;
  const newReadingPublic = store?.store.reading_public_default ?? true;

  // 公開：日記貼文 → 沒有地點或公開場所才可以；正在讀 → 預設跟著那本書；想去 → 公開場所才可以
  const canPublic = kind === 'want' ? !!googlePlace?.public_ok : kind === 'post' ? !place || !!googlePlace?.public_ok : true;
  const defaultPublic = kind === 'reading' ? (linkedReading ? linkedReading.is_public : newReadingPublic) && !!store?.store.show_post : kind === 'want' ? !!store?.store.show_place : false;
  // v1.6：想去不再一則一則選公開（公開場所一律可以顯示，要不要出現在書店頁只看公開設定）
  const publicOn = kind === 'want' ? canPublic : canPublic && (isPublic ?? defaultPublic);

  const dirty = existing
    ? body !== (existing.body ?? '') || book?.id !== existing.book?.id || photos.length !== existing.photo_paths.length || photos.some((p) => 'uri' in p) || publicOn !== existing.is_public || placeKey(place) !== (existing.place_id ?? existing.place_label ?? '') || pageRef !== (existing.page_ref ?? '')
    : kind === 'want'
      ? !editingWant && !!(place || wantNote.trim())
      : !!(body.trim() || photos.length || (kind === 'post' && place) || pageRef.trim());

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

  const ready =
    kind === 'want' ? !!googlePlace : kind === 'reading' ? !!book && !!(body.trim() || photos.length || pageRef.trim() || finished) : !!(body.trim() || photos.length || place);
  const finish = () => {
    setDone(true);
    setTimeout(() => router.back(), 0);
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (kind === 'want') {
        if (!googlePlace) return;
        await savePlace.mutateAsync({
          placeId: googlePlace.id,
          save: true,
          note: wantNote,
          type: placeType,
          from: editingWant ? 'edit' : 'compose',
          ...(wantLink !== null ? { link: wantLink } : {}),
          isPublic: publicOn,
        });
        finish();
        return;
      }

      let readingNoteId: string | null = null;
      if (kind === 'reading' && book && !existing) {
        const status: ReadingStatus = finished ? 'finished' : 'reading';
        let readingId = linkedReading?.id;
        if (!readingId) readingId = (await addReading.mutateAsync({ bookId: book.id, status, isPublic: newReadingPublic })).id;
        else if (linkedReading && linkedReading.status !== status) await updateReading.mutateAsync({ id: readingId, status });
        if (alsoNote && body.trim()) {
          readingNoteId = (await saveNote.mutateAsync({ readingId, input: { kind: 'thought', body, photos: photos.filter((p) => 'uri' in p), fromScan: false } })).id;
        }
      }
      const text = body.trim() || (kind === 'reading' && !photos.length ? (pageRef.trim() ? tr('讀到 {page}', { page: pageRef.trim() }) : tr('讀完了')) : '');
      const isCheckin = kind === 'post' && !!place;
      await save.mutateAsync({
        entryId: existing?.id,
        previousPaths: existing?.photo_paths,
        input: {
          kind: isCheckin ? 'checkin' : 'note',
          bookId: kind === 'reading' ? book?.id ?? null : existing?.book?.id ?? null,
          body: text,
          placeId: isCheckin && place?.kind === 'google' ? place.place.id : null,
          placeLabel: isCheckin && place?.kind === 'label' ? place.label : null,
          photos,
          isPublic: !!publicOn,
          pageRef: kind === 'reading' ? pageRef : null,
          readingNoteId,
        },
      });
      if (isCheckin && googlePlace && placeType && !existing) await setPlaceType.mutateAsync({ placeId: googlePlace.id, type: placeType }).catch(() => {});
      finish();
    } catch (e) {
      Alert.alert(tr('沒有儲存成功'), diaryError((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const removeWant = () =>
    googlePlace &&
    savePlace.mutate({ placeId: googlePlace.id, save: false }, { onSuccess: finish, onError: (e) => Alert.alert(tr('沒有成功'), diaryError(e.message)) });

  const typeChips = (
    <View style={{ gap: Spacing.sm }}>
      <AppText variant="label">
        {tr('類型')}
        <AppText variant="caption" muted>{tr('  選填')}</AppText>
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
        {PLACE_CATEGORIES.map((t) => (
          <Chip key={t} label={categoryLabel(t)} selected={placeType === t} onPress={() => setPlaceTypeState(placeType === t ? null : t)} />
        ))}
      </View>
      <AppText variant="caption" muted>{tr('你選的類型會幫地點分類（大家選最多的那個）。不選也可以。')}</AppText>
    </View>
  );

  const placeField = (
    <View style={{ gap: Spacing.sm }}>
      <AppText variant="label">
        {tr('地點')}
        {kind === 'post' ? <AppText variant="caption" muted>{tr('  選填 · 加了地點就是打卡')}</AppText> : null}
      </AppText>
      <Pressable accessibilityRole="button" disabled={editingWant} onPress={() => setPlaceOpen(true)} style={[styles.field, { backgroundColor: c.surface, borderColor: place ? c.border : kind === 'want' ? c.primary : c.border }]}>
        <Feather name={googlePlace ? categoryIcon(googlePlace.category) : place ? 'edit-3' : 'map-pin'} size={18} color={place ? c.text : c.primary} />
        <View style={{ flex: 1 }}>
          <AppText variant="label" style={{ color: place ? c.text : c.primary }} numberOfLines={1}>
            {place ? (place.kind === 'google' ? place.place.name : place.label) : kind === 'post' ? tr('＋ 加地點（打卡）') : tr('選一個地點')}
          </AppText>
          {place ? (
            <AppText variant="caption" muted numberOfLines={1}>
              {place.kind === 'google' ? [categoryLabel(place.place.category), place.place.address].filter(Boolean).join(' · ') || tr('Google 地點') : tr('自己輸入的地點')}
            </AppText>
          ) : null}
        </View>
        {place && kind === 'post' ? (
          <Pressable accessibilityRole="button" accessibilityLabel={tr('拿掉地點')} hitSlop={8} onPress={() => setPlace(null)} style={styles.iconBtn}>
            <Feather name="x" size={18} color={c.textSecondary} />
          </Pressable>
        ) : !editingWant && place ? (
          <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('更換')}</AppText>
        ) : null}
      </Pressable>
      {kind === 'want' && place?.kind === 'label' ? <AppText variant="caption" style={{ color: c.danger }}>{tr('想去要選 Google 上的地點，才能在地圖打開。')}</AppText> : null}
    </View>
  );

  const photoField = (
    <View style={{ gap: Spacing.sm }}>
      <AppText variant="label">
        {tr('照片')}
        <AppText variant="caption" muted>{publicOn ? tr('  最多 {n} 張 · 會跟著公開', { n: DIARY_PHOTO_MAX }) : tr('  最多 {n} 張', { n: DIARY_PHOTO_MAX })}</AppText>
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
  );

  const publicHint =
    kind === 'want'
      ? !googlePlace
        ? tr('選了公開場所（書店、圖書館、咖啡店…）才能顯示在書店頁。')
        : !googlePlace.public_ok
          ? tr('這裡看起來是私人地點，只會留在自己的書櫃裡。')
          : store?.store.show_place
            ? tr('公開設定裡「想去的地點」開著：讀者會在你的書店頁看到這個地方與原因；連結不公開。')
            : tr('公開設定裡「想去的地點」沒開，只有你看得到。')
      : place?.kind === 'label'
        ? tr('自己輸入的地點只有自己看得到。')
        : googlePlace && !googlePlace.public_ok
          ? tr('這裡看起來是私人地點，只會留在自己的日記裡。')
          : publicOn
            ? googlePlace
              ? tr('會出現在探索的貼文、「{name}」的地點頁和你的書店頁。', { name: googlePlace.name })
              : tr('會出現在探索的貼文和你的書店頁。')
            : tr('只有自己看得到。');

  const visibility = (
    <View style={[styles.switchRow, { backgroundColor: c.surface, opacity: canPublic ? 1 : 0.6 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">{kind === 'want' ? tr('顯示在書店頁') : tr('公開')}</AppText>
        <AppText variant="caption" muted>{publicHint}</AppText>
      </View>
      <Toggle accessibilityLabel={kind === 'want' ? tr('顯示在書店頁') : tr('公開')} value={!!publicOn} disabled={!canPublic} onValueChange={setIsPublic} />
    </View>
  );

  const title = existing ? tr('編輯日記') : kind === 'want' ? (editingWant ? tr('編輯想去') : tr('想去的地點')) : kind === 'reading' ? tr('正在讀') : tr('日記');

  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText variant="caption" muted>{kind === 'want' ? tr('還沒去、先存起來；到了打卡就會移到「去過」') : tr('今天 · {date}', { date: dayLabel(today) })}</AppText>
            {kind !== 'want' ? <VisibilityBadge v={publicOn ? { public: true, where: 'post' } : { public: false }} /> : null}
          </View>

          {kind === 'want' ? (
            <>
              {placeField}
              <TextField label={tr('為什麼想去？')} optional max={PLACE_NOTE_MAX} value={wantNote} onChangeText={setWantNote} placeholder={tr('朋友推薦、想找某本書、二樓很安靜…')} />
              <TextField
                label={tr('連結')}
                optional
                max={500}
                value={wantLink ?? ''}
                onChangeText={setWantLink}
                placeholder="https://"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                hint={editingWant && wantLink === null ? tr('看到它的貼文或文章；只有你自己看得到。留空就保留原本的連結。') : tr('看到它的貼文或文章；只有你自己看得到')}
              />
              {googlePlace ? typeChips : null}
              <AppText variant="caption" muted>{publicHint}</AppText>
              {editingWant ? <Button kind="link" label={tr('從想去移除')} onPress={removeWant} /> : null}
            </>
          ) : null}

          {kind === 'reading' ? (
            <>
              <View style={{ gap: Spacing.sm }}>
                <AppText variant="label">{tr('今天讀哪一本')}</AppText>
                {existing ? (
                  book ? (
                    <View style={[styles.field, { backgroundColor: c.surface, borderColor: c.border }]}>
                      <BookCover title={book.title} url={book.cover_url} color={store?.store.color ?? 'moss'} size="sm" />
                      <AppText variant="label" style={{ flex: 1 }} numberOfLines={2}>{bookTitle(book.title)}</AppText>
                    </View>
                  ) : null
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
                    {[...nowReading.map((r) => r.books), ...(book && !nowReading.some((r) => r.books.id === book.id) ? [book] : [])].map((b) => {
                      const on = book?.id === b.id;
                      return (
                        <Pressable
                          key={b.id}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={b.title}
                          onPress={() => setBook({ id: b.id, title: b.title, cover_url: b.cover_url })}
                          style={[styles.readingCard, { backgroundColor: c.surface, borderColor: on ? c.primary : c.border, borderWidth: on ? 2 : 1 }]}>
                          <BookCover title={b.title} url={b.cover_url} color={store?.store.color ?? 'moss'} size="md" />
                          <AppText variant="caption" style={{ fontWeight: '700' }} numberOfLines={2}>{bookTitle(b.title)}</AppText>
                          {on ? (
                            <View style={[styles.check, { backgroundColor: c.primary }]}>
                              <Feather name="check" size={12} color={c.onPrimary} />
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                    <Pressable accessibilityRole="button" onPress={() => setBookOpen(true)} style={[styles.readingCard, styles.otherBook, { borderColor: c.border }]}>
                      <Feather name="plus" size={22} color={c.primary} />
                      <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('其他書')}</AppText>
                    </Pressable>
                  </ScrollView>
                )}
                {!existing && book && !linkedReading ? <AppText variant="caption" muted>{tr('這本會順便加入「正在讀」。')}</AppText> : null}
              </View>

              <View style={{ flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}>
                  <TextField label={tr('讀到第幾頁')} optional max={20} value={pageRef} onChangeText={setPageRef} placeholder={tr('例如 p.156')} />
                </View>
                {!existing ? (
                  <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingBottom: 6 }}>
                    <Chip label={tr('還在讀')} selected={!finished} onPress={() => setFinished(false)} />
                    <Chip label={tr('讀完了')} selected={finished} onPress={() => setFinished(true)} />
                  </View>
                ) : null}
              </View>

              <TextField label={tr('今天讀了什麼')} optional multiline max={DIARY_BODY_MAX} value={body} onChangeText={setBody} placeholder={tr('讀到哪、想到什麼都可以')} />
              {photoField}
              {!existing && body.trim() ? (
                <Check
                  checked={alsoNote}
                  onPress={() => setAlsoNote(!alsoNote)}
                  label={tr('也存成這本書的心得')}
                  sub={(linkedReading ? linkedReading.is_public : newReadingPublic) ? tr('這本書公開在書店頁，讀者會看到這則心得（想法）。') : tr('存成「想法」，只有自己看得到。')}
                />
              ) : existing?.reading_note_id ? (
                <AppText variant="caption" muted>{tr('這則也存成了心得；要修改心得請到這本書的頁面。')}</AppText>
              ) : null}
              {visibility}
            </>
          ) : null}

          {kind === 'post' ? (
            <>
              <TextField label={tr('今天')} optional={photos.length > 0 || !!place} multiline max={DIARY_BODY_MAX} value={body} onChangeText={setBody} placeholder={tr('今天在哪裡、讀了什麼、想到什麼')} />
              {photoField}
              {placeField}
              {googlePlace && !existing ? typeChips : null}
              {visibility}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Button
          label={kind === 'want' ? (editingWant ? tr('儲存') : tr('存成想去')) : kind === 'reading' ? tr('記下來') : publicOn ? tr('發布') : tr('儲存')}
          disabled={!ready}
          loading={busy}
          onPress={() => void submit()}
        />
      </SafeAreaView>

      <PlacePicker
        visible={placeOpen}
        googleOnly={kind === 'want'}
        title={kind === 'want' ? tr('加一個想去的地方') : undefined}
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
        onAdd={async (b: Book) => setBook({ id: b.id, title: b.title, cover_url: b.cover_url })}
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
  field: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, minHeight: 56, paddingVertical: Spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg },
  iconBtn: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center', marginRight: -Spacing.sm },
  photo: { width: 84, height: 84, borderRadius: 10 },
  addPhoto: { borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2 },
  remove: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(31,27,22,0.8)', alignItems: 'center', justifyContent: 'center' },
  readingCard: { width: 104, borderRadius: Radius.lg, padding: 10, gap: 6 },
  otherBook: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', width: 92 },
  check: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
});
