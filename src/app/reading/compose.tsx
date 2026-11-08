import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { TextField } from '@/components/form';
import { kindLabel, NOTE_KINDS } from '@/components/note-card';
import { NoteScanSheet } from '@/components/note-scan';
import { AppText, Button, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NoteKind } from '@/lib/browse';
import { tr } from '@/lib/i18n';
import { useMyStore } from '@/lib/queries';
import {
  NOTE_BODY_MAX,
  NOTE_PAGE_MAX,
  NOTE_PHOTO_MAX,
  NOTE_TITLE_MAX,
  QUOTE_SOFT_MAX,
  readingError,
  useMyReading,
  useNoteImageUrls,
  useSaveNote,
  type NotePhoto,
} from '@/lib/readings';
import { scanAvailable } from '@/lib/text-scan';

const ICON: Record<NoteKind, React.ComponentProps<typeof Feather>['name']> = { quote: 'bookmark', reflection: 'edit-3', thought: 'zap' };

/**
 * R8 寫心得／編輯心得（整頁）。類型 → 內容 → 頁碼、標題 → 圖片 → 底部儲存。
 * 摘句可以「掃描書頁」把文字節錄進來（R9）。
 */
export default function ComposeNoteScreen() {
  const { readingId, noteId } = useLocalSearchParams<{ readingId: string; noteId?: string }>();
  const c = useTheme();
  const { data: r, isLoading } = useMyReading(readingId);
  const { data: store } = useMyStore();
  const save = useSaveNote();
  const existing = r?.reading_notes.find((n) => n.id === noteId);

  const [kind, setKind] = useState<NoteKind>('reflection');
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [pageRef, setPageRef] = useState('');
  const [photos, setPhotos] = useState<NotePhoto[]>([]);
  const [fromScan, setFromScan] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [done, setDone] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current || !existing) return;
    loaded.current = true;
    setKind(existing.kind);
    setBody(existing.body);
    setTitle(existing.title ?? '');
    setPageRef(existing.page_ref ?? '');
    setPhotos(existing.photo_paths.map((path) => ({ path })));
  }, [existing]);

  const existingPaths = photos.filter((p): p is { path: string } => 'path' in p).map((p) => p.path);
  const { data: signed } = useNoteImageUrls(existing?.photo_paths);

  const dirty = existing
    ? body !== existing.body || title !== (existing.title ?? '') || pageRef !== (existing.page_ref ?? '') || kind !== existing.kind || photos.length !== existing.photo_paths.length || photos.some((p) => 'uri' in p)
    : !!(body.trim() || title.trim() || pageRef.trim() || photos.length);

  usePreventRemove(dirty && !done, ({ repeat }) => {
    Alert.alert(tr('捨棄這則心得？'), tr('還沒儲存的內容會不見。'), [
      { text: tr('繼續寫'), style: 'cancel' },
      { text: tr('捨棄'), style: 'destructive', onPress: repeat },
    ]);
  });

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!r || !store || (noteId && !existing)) return <EmptyState title={tr('找不到這筆閱讀紀錄')} body={tr('它可能已經被移除了。')} />;

  const addPhoto = async (source: 'camera' | 'library') => {
    const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert(tr('需要讀取照片'), tr('可以到手機設定開啟權限。'));
    const left = NOTE_PHOTO_MAX - photos.length;
    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: true, selectionLimit: left });
    if (res.canceled) return;
    setPhotos((p) => [...p, ...res.assets.slice(0, left).map((a) => ({ uri: a.uri, mimeType: a.mimeType }))]);
  };

  const pickPhoto = () =>
    Alert.alert(tr('加入圖片'), undefined, [
      { text: tr('拍照'), onPress: () => void addPhoto('camera') },
      { text: tr('從相簿選'), onPress: () => void addPhoto('library') },
      { text: tr('取消'), style: 'cancel' },
    ]);

  const submit = () => {
    const doSave = () =>
      save.mutate(
        { readingId: r.id, noteId: existing?.id, previousPaths: existing?.photo_paths, input: { kind, title, body, pageRef, photos, fromScan } },
        {
          onSuccess: () => {
            setDone(true);
            setTimeout(() => router.back(), 0);
          },
          onError: (e) => Alert.alert(tr('沒有儲存成功'), readingError(e.message)),
        },
      );
    // 公開的長摘句：提醒只節錄一小段（著作權）
    if (r.is_public && kind === 'quote' && ([...body].length > QUOTE_SOFT_MAX || photos.length)) {
      Alert.alert(tr('公開引用請只節錄一小段'), tr('這本書公開在書店頁，讀者看得到這則摘句與圖片。請不要放整頁內文或整頁照片。'), [
        { text: tr('回去修改'), style: 'cancel' },
        { text: tr('照樣儲存'), onPress: doSave },
      ]);
      return;
    }
    doSave();
  };

  const bodyLabel = kind === 'quote' ? tr('摘句內容') : kind === 'thought' ? tr('想法') : tr('心得內容');
  const placeholder = kind === 'quote' ? tr('抄下打動你的那一句') : kind === 'thought' ? tr('讀著讀著想到的事') : tr('讀到哪、想到什麼？');

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? tr('編輯心得') : tr('寫心得') }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
            <BookCover title={r.books.title} url={r.books.cover_url} color={store.store.color} size="sm" />
            <AppText variant="label" style={{ flex: 1 }} numberOfLines={1}>{r.books.title}</AppText>
          </View>

          <View style={[styles.segment, { backgroundColor: c.surfaceMuted }]} accessibilityRole="radiogroup">
            {NOTE_KINDS.map((k) => (
              <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected: kind === k }} onPress={() => setKind(k)} style={[styles.segmentItem, kind === k && { backgroundColor: c.surface }]}>
                <Feather name={ICON[k]} size={14} color={kind === k ? c.text : c.textSecondary} />
                <AppText variant="caption" style={{ fontWeight: '700', color: kind === k ? c.text : c.textSecondary }}>{kindLabel(k)}</AppText>
              </Pressable>
            ))}
          </View>

          {scanAvailable() ? (
            <Pressable accessibilityRole="button" onPress={() => setScanOpen(true)} style={[styles.scan, { borderColor: c.primary }]}>
              <Feather name="camera" size={18} color={c.primary} />
              <AppText variant="label" style={{ color: c.primary }}>{tr('掃描書頁，把文字節錄下來')}</AppText>
            </Pressable>
          ) : null}

          <View style={{ gap: 4 }}>
            <TextField label={bodyLabel} multiline max={NOTE_BODY_MAX} value={body} onChangeText={setBody} placeholder={placeholder} />
            {fromScan ? <AppText variant="caption" muted>{tr('來自掃描 · 可以直接修改錯字')}</AppText> : null}
            {r.is_public && kind === 'quote' && [...body].length > QUOTE_SOFT_MAX ? (
              <AppText variant="caption" style={{ color: c.danger }}>{tr('公開的摘句建議 {n} 字以內', { n: QUOTE_SOFT_MAX })}</AppText>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', gap: Spacing.md }}>
            {kind === 'quote' ? (
              <View style={{ flex: 1 }}>
                <TextField label={tr('頁碼')} optional max={NOTE_PAGE_MAX} value={pageRef} onChangeText={setPageRef} placeholder="p.128" />
              </View>
            ) : null}
            <View style={{ flex: 2 }}>
              <TextField label={tr('標題')} optional max={NOTE_TITLE_MAX} value={title} onChangeText={setTitle} placeholder={tr('一句話標題')} />
            </View>
          </View>

          <View style={{ gap: Spacing.sm }}>
            <AppText variant="label">
              {tr('圖片')}
              <AppText variant="caption" muted>{tr('  最多 {n} 張 · 跟著這本書的公開設定', { n: NOTE_PHOTO_MAX })}</AppText>
            </AppText>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              {photos.map((p, i) => {
                const uri = 'uri' in p ? p.uri : signed?.[existing?.photo_paths.indexOf(p.path) ?? -1] ?? undefined;
                return (
                  <View key={'uri' in p ? p.uri : p.path}>
                    <Image source={uri ? { uri } : undefined} style={[styles.photo, { backgroundColor: c.surfaceMuted }]} contentFit="cover" accessibilityLabel={tr('心得的圖片 {n}', { n: i + 1 })} />
                    <Pressable accessibilityRole="button" accessibilityLabel={tr('移除這張圖片')} hitSlop={8} onPress={() => setPhotos((ps) => ps.filter((_, j) => j !== i))} style={styles.remove}>
                      <Feather name="x" size={14} color="#FFFFFF" />
                    </Pressable>
                  </View>
                );
              })}
              {photos.length < NOTE_PHOTO_MAX ? (
                <Pressable accessibilityRole="button" accessibilityLabel={tr('加入圖片')} onPress={pickPhoto} style={[styles.photo, styles.addPhoto, { borderColor: c.border }]}>
                  <Feather name="plus" size={20} color={c.textSecondary} />
                  <AppText variant="caption" muted>{tr('圖片')}</AppText>
                </Pressable>
              ) : null}
            </View>
          </View>
          {existingPaths.length !== (existing?.photo_paths.length ?? 0) ? <AppText variant="caption" muted>{tr('移除的圖片會在儲存後刪除')}</AppText> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Button label={tr('儲存')} disabled={!body.trim()} loading={save.isPending} onPress={submit} />
      </SafeAreaView>

      <NoteScanSheet
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        onDone={({ text, photo }) => {
          setScanOpen(false);
          setKind('quote');
          setFromScan(true);
          setBody((b) => (b.trim() ? `${b.trim()}\n${text}` : text).slice(0, NOTE_BODY_MAX));
          if (photo && photos.length < NOTE_PHOTO_MAX) setPhotos((p) => [...p, photo]);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', borderRadius: Radius.md, padding: 3 },
  segmentItem: { flex: 1, minHeight: MinTouch - 4, borderRadius: Radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  scan: { minHeight: MinTouch + 4, borderRadius: Radius.md, borderWidth: 1.5, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  photo: { width: 72, height: 72, borderRadius: 10 },
  addPhoto: { borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2 },
  remove: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(31,27,22,0.8)', alignItems: 'center', justifyContent: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
});
