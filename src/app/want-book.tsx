import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { BookPicker } from '@/components/book-picker';
import { TextField } from '@/components/form';
import { SourcePicker } from '@/components/source-picker';
import { AppText, Button, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { useSavedBooks, useSaveIds, useStartReading, useToggleSave, useUpsertWant, wantSource, type SavedBook } from '@/lib/browse';
import type { Book } from '@/lib/curations';
import { userMessage } from '@/lib/errors';
import { useMyStore } from '@/lib/queries';
import { readingError } from '@/lib/readings';
import { bookTitle, tr } from '@/lib/i18n';

/**
 * F3 想讀的書（v1.6 統一版型）：新增與編輯同一頁（帶 bookId = 編輯）。
 * 書 → 為什麼想讀 → 在哪看到 → 連結（只有自己看得到）→ 底部主要按鈕。
 * 不再有「顯示在書店頁」開關：想讀要不要出現在書店頁，只看公開設定。
 */
export default function WantBookScreen() {
  const { bookId, q } = useLocalSearchParams<{ bookId?: string; q?: string }>();
  const saves = useSavedBooks();
  if (bookId && saves.isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  const existing = bookId ? saves.data?.find((s) => s.book_id === bookId) : undefined;
  return <WantBookForm key={existing?.book_id ?? 'new'} existing={existing} initialQuery={bookId ? undefined : q} />;
}

function WantBookForm({ existing, initialQuery }: { existing?: SavedBook; initialQuery?: string }) {
  const c = useTheme();
  const { data: mine } = useMyStore();
  const { data: saveIds } = useSaveIds();
  const upsert = useUpsertWant();
  const start = useStartReading();
  const remove = useToggleSave();
  const [book, setBook] = useState<Book | null>(existing?.books ?? null);
  // 從探索搜尋「加入想讀」進來：直接打開搜書，帶入關鍵字
  const [pickerOpen, setPickerOpen] = useState(!!initialQuery);
  const [note, setNote] = useState(existing?.note ?? '');
  const [source, setSource] = useState(existing?.source_text ?? '');
  const [link, setLink] = useState(existing?.link ?? '');
  const [done, setDone] = useState(false);
  const already = !existing && !!book && !!saveIds?.has(book.id);
  const auto = existing && !existing.source_text ? wantSource(existing) : null;

  const dirty = existing
    ? note !== (existing.note ?? '') || source !== (existing.source_text ?? '') || link !== (existing.link ?? '')
    : !!(book || note.trim() || source.trim() || link.trim());

  usePreventRemove(dirty && !done, ({ repeat }) => {
    Alert.alert(tr('放棄這次的修改？'), tr('還沒儲存的內容會不見。'), [
      { text: tr('繼續編輯'), style: 'cancel' },
      { text: tr('放棄'), style: 'destructive', onPress: repeat },
    ]);
  });
  const leave = () => {
    setDone(true);
    setTimeout(() => router.back(), 0);
  };
  const fail = (e: Error) => Alert.alert(tr('沒有成功'), userMessage(e));

  const submit = () => {
    if (!book) return;
    upsert.mutate(
      { bookId: book.id, note, sourceText: source, link, isPublic: true },
      {
        onSuccess: () => {
          track('want_book_saved', { has_note: !!note.trim(), has_source: !!source.trim(), has_link: !!link.trim(), edit: !!existing });
          leave();
        },
        onError: (e) => Alert.alert(tr('沒有加入成功'), readingError(e.message)),
      },
    );
  };

  const startReading = async () => {
    if (!existing) return;
    try {
      if (dirty) await upsert.mutateAsync({ bookId: existing.book_id, note, sourceText: source, link, isPublic: true });
      await start.mutateAsync(existing.book_id);
      leave();
      Alert.alert(tr('已移到「正在讀」'), tr('可以在我的書店 › 店主閱讀繼續寫心得。'));
    } catch (e) {
      fail(e as Error);
    }
  };

  const removeWant = () =>
    Alert.alert(tr('從想讀移除？'), existing ? bookTitle(existing.books.title) : undefined, [
      { text: tr('先留著'), style: 'cancel' },
      {
        text: tr('移除'),
        style: 'destructive',
        onPress: () => existing && remove.mutate({ bookId: existing.book_id, save: false }, { onSuccess: leave, onError: fail }),
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? tr('編輯想讀') : tr('想讀的書') }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 6 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={book ? (existing ? book.title : tr('已選：{title}，點兩下重選', { title: book.title })) : tr('選一本書')}
              disabled={!!existing}
              onPress={() => setPickerOpen(true)}
              style={[styles.bookField, { borderColor: book ? 'transparent' : c.primary, backgroundColor: c.surface }]}>
              {book ? (
                <>
                  <BookCover title={book.title} url={book.cover_url} color={mine?.store.color ?? 'moss'} size="sm" />
                  <View style={{ flex: 1 }}>
                    <AppText variant="label" style={{ fontSize: 16 }}>{bookTitle(book.title)}</AppText>
                    <AppText variant="caption" muted>{book.authors.join(tr('、'))}</AppText>
                  </View>
                  {!existing ? <Feather name="chevron-right" size={18} color={c.textTertiary} /> : null}
                </>
              ) : (
                <>
                  <Feather name="search" size={18} color={c.primary} />
                  <AppText style={{ flex: 1, color: c.primary, fontWeight: '700' }}>{tr('搜尋書名或作者')}</AppText>
                </>
              )}
            </Pressable>
            {already ? <AppText variant="caption" muted>{tr('這本已經在想讀裡，儲存會更新原因與來源。')}</AppText> : null}
          </View>

          <TextField label={tr('為什麼想讀')} optional multiline max={200} value={note} onChangeText={setNote} placeholder={tr('哪一句話、哪個人讓你想讀它？')} />
          <SourcePicker value={source} onChange={setSource} />
          {auto && !source ? <AppText variant="caption" muted style={{ marginTop: -8 }}>{tr('目前顯示：{auto}', { auto })}</AppText> : null}
          <TextField
            label={tr('連結')}
            optional
            max={500}
            value={link}
            onChangeText={setLink}
            placeholder="https://"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            hint={tr('書評、貼文、Podcast 那一集…只有你自己看得到')}
          />

          {existing ? (
            <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
              {mine ? <Button kind="secondary" label={tr('開始讀')} loading={start.isPending} onPress={() => void startReading()} /> : null}
              <Button kind="link" label={tr('從想讀移除')} onPress={removeWant} />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Button label={already || existing ? tr('儲存') : tr('加入想讀')} disabled={!book || (!!existing && !dirty)} loading={upsert.isPending} onPress={submit} />
      </SafeAreaView>

      <BookPicker
        visible={pickerOpen}
        mode="single"
        storeColor={mine?.store.color ?? 'moss'}
        pickedIds={new Set()}
        initialQuery={initialQuery}
        onClose={() => setPickerOpen(false)}
        onAdd={async (b) => setBook(b)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bookField: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, minHeight: 64 },
  footer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
