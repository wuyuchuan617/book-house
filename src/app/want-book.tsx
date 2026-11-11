import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { BookPicker } from '@/components/book-picker';
import { Chip, chipRow, TextField, Toggle } from '@/components/form';
import { SOURCE_SUGGESTIONS } from '@/components/want-sheet';
import { AppText, Button, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { useSavedBooks, useSaveIds, useUpsertWant, type SavedBook } from '@/lib/browse';
import type { Book } from '@/lib/curations';
import { useMyStore } from '@/lib/queries';
import { readingError } from '@/lib/readings';
import { tr } from '@/lib/i18n';

/** F3 想讀的書（＋選單）：書、為什麼想讀、在哪看到、連結（只有自己看得到）、顯示在書店頁；帶 bookId = 編輯 */
export default function WantBookScreen() {
  const { bookId } = useLocalSearchParams<{ bookId?: string }>();
  const saves = useSavedBooks();
  if (bookId && saves.isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  return <WantBookForm existing={bookId ? saves.data?.find((s) => s.book_id === bookId) : undefined} />;
}

function WantBookForm({ existing }: { existing?: SavedBook }) {
  const c = useTheme();
  const { data: mine } = useMyStore();
  const { data: saveIds } = useSaveIds();
  const upsert = useUpsertWant();
  const [book, setBook] = useState<Book | null>(existing?.books ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [note, setNote] = useState(existing?.note ?? '');
  const [source, setSource] = useState(existing?.source_text ?? '');
  const [link, setLink] = useState(existing?.link ?? '');
  const [isPublic, setIsPublic] = useState<boolean | null>(existing?.is_public ?? null);
  const showWant = mine?.store.show_want ?? false;
  const publicValue = isPublic ?? showWant;
  const already = !existing && !!book && !!saveIds?.has(book.id);

  const submit = () => {
    if (!book) return;
    upsert.mutate(
      { bookId: book.id, note, sourceText: source, link, isPublic: publicValue },
      {
        onSuccess: () => {
          track('want_book_saved', { has_note: !!note.trim(), has_source: !!source.trim(), has_link: !!link.trim(), public: publicValue });
          router.back();
        },
        onError: (e) => Alert.alert(tr('沒有加入成功'), readingError(e.message)),
      },
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? tr('編輯想讀') : tr('想讀的書') }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 6 }}>
            <AppText variant="label">{tr('書')}</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={book ? tr('已選：{title}，點兩下換一本', { title: book.title }) : tr('選一本書')}
              disabled={!!existing}
              onPress={() => setPickerOpen(true)}
              style={[styles.bookField, { borderColor: book ? c.border : c.primary, backgroundColor: c.surface }]}>
              {book ? (
                <>
                  <BookCover title={book.title} url={book.cover_url} color={mine?.store.color ?? 'moss'} size="sm" />
                  <View style={{ flex: 1 }}>
                    <AppText variant="label">{book.title}</AppText>
                    <AppText variant="caption" muted>{book.authors.join(tr('、'))}</AppText>
                  </View>
                  {!existing ? <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('換一本')}</AppText> : null}
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
          <View style={{ gap: Spacing.sm }}>
            <TextField label={tr('在哪看到')} optional max={60} value={source} onChangeText={setSource} placeholder={tr('例如：朋友推薦')} />
            <View style={chipRow}>
              {SOURCE_SUGGESTIONS().map((s) => <Chip key={s} label={s} selected={source === s} onPress={() => setSource(source === s ? '' : s)} />)}
            </View>
          </View>
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
          <View style={[styles.switchRow, { backgroundColor: c.surface }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="label">{tr('顯示在書店頁')}</AppText>
              <AppText variant="caption" muted>
                {showWant ? tr('讀者會在你的書店頁「店主手記」看到書名與原因。') : tr('公開設定裡「想讀的書」還沒打開，打開後才會顯示。')}
              </AppText>
            </View>
            <Toggle accessibilityLabel={tr('顯示在書店頁')} value={publicValue} onValueChange={setIsPublic} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Button label={already || existing ? tr('儲存') : tr('加入想讀')} disabled={!book} loading={upsert.isPending} onPress={submit} />
      </SafeAreaView>

      <BookPicker
        visible={pickerOpen}
        mode="single"
        storeColor={mine?.store.color ?? 'moss'}
        pickedIds={new Set()}
        onClose={() => setPickerOpen(false)}
        onAdd={async (b) => setBook(b)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bookField: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, minHeight: 56 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg },
  footer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
