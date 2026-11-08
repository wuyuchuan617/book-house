import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { BookPicker } from '@/components/book-picker';
import { Chip, chipRow, TextField } from '@/components/form';
import { AppText, Button, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Book } from '@/lib/curations';
import { useMyStore } from '@/lib/queries';
import { useUpsertWant } from '@/lib/browse';
import { SOURCE_SUGGESTIONS } from '@/components/want-sheet';
import { NOTE_BODY_MAX, readingError, useAddReading, useMyCurationBooks, useMyReadings, type ReadingStatus } from '@/lib/readings';

/** R2／R4 記錄一本書（想讀／正在讀／讀完了）；O8 從開張完成頁進來時固定為「正在讀」 */
type Status = ReadingStatus | 'want';
export default function NewReadingScreen() {
  const { from, status: initialStatus } = useLocalSearchParams<{ from?: string; status?: string }>();
  const fromOpen = from === 'open-store';
  const c = useTheme();
  const { data: store } = useMyStore();
  const { data: readings } = useMyReadings();
  const { data: suggestions } = useMyCurationBooks();
  const add = useAddReading();
  const [book, setBook] = useState<Book | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [status, setStatus] = useState<Status>(initialStatus === 'want' ? 'want' : 'reading');
  const [source, setSource] = useState('');
  const upsertWant = useUpsertWant();
  const [note, setNote] = useState('');
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const publicValue = isPublic ?? store?.store.reading_public_default ?? true;
  const pickedIds = useMemo(() => new Set((readings ?? []).map((r) => r.books.id)), [readings]);

  if (!store) return null;

  const submit = () => {
    if (!book) return;
    const onError = (e: Error) => Alert.alert('沒有加入成功', readingError(e.message));
    if (status === 'want') {
      upsertWant.mutate({ bookId: book.id, note, sourceText: source }, { onSuccess: () => router.back(), onError });
      return;
    }
    add.mutate({ bookId: book.id, status, isPublic: publicValue, note }, { onSuccess: () => router.back(), onError });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: fromOpen ? '記錄一本正在讀的書' : status === 'want' ? '加入想讀' : '記錄一本書' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.xl }} keyboardShouldPersistTaps="handled">
          {fromOpen ? <AppText muted>會以「正在讀」加入，之後可改成讀完。</AppText> : null}

          <View style={{ gap: 6 }}>
            <AppText variant="label">書</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={book ? `已選：${book.title}，點兩下換一本` : '選一本書'}
              onPress={() => setPickerOpen(true)}
              style={[styles.bookField, { borderColor: c.border, backgroundColor: c.surface }]}>
              {book ? (
                <>
                  <BookCover title={book.title} url={book.cover_url} color={store.store.color} size="sm" />
                  <View style={{ flex: 1 }}>
                    <AppText variant="label">{book.title}</AppText>
                    <AppText variant="caption" muted>{book.authors.join('、')}</AppText>
                  </View>
                  <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>換一本</AppText>
                </>
              ) : (
                <>
                  <Feather name="search" size={18} color={c.textSecondary} />
                  <AppText muted style={{ flex: 1 }}>搜尋書名或作者</AppText>
                </>
              )}
            </Pressable>
            {!book ? <AppText variant="caption" muted>點一下開啟搜尋，找不到也能手動新增。</AppText> : null}
          </View>

          {!fromOpen ? (
            <View style={{ gap: 6 }}>
              <AppText variant="label">閱讀狀態</AppText>
              <View style={[styles.segment, { backgroundColor: c.surfaceMuted }]} accessibilityRole="radiogroup">
                {(['want', 'reading', 'finished'] as Status[]).map((s) => (
                  <Pressable key={s} accessibilityRole="radio" accessibilityState={{ selected: status === s }} onPress={() => setStatus(s)} style={[styles.segmentItem, status === s && { backgroundColor: c.surface }]}>
                    <AppText style={{ fontWeight: '700', color: status === s ? c.text : c.textSecondary }}>{s === 'want' ? '想讀' : s === 'reading' ? '正在讀' : '讀完了'}</AppText>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {status === 'want' ? (
            <>
              <TextField label="為什麼想讀" optional multiline max={200} value={note} onChangeText={setNote} placeholder="哪一句話、哪個人讓你想讀它？" hint="開始讀的時候，這段會變成第一則心得。" />
              <View style={{ gap: Spacing.sm }}>
                <TextField label="在哪看到" optional max={60} value={source} onChangeText={setSource} placeholder="例如：朋友推薦" />
                <View style={chipRow}>
                  {SOURCE_SUGGESTIONS.map((s) => <Chip key={s} label={s} selected={source === s} onPress={() => setSource(source === s ? '' : s)} />)}
                </View>
              </View>
            </>
          ) : (
          <TextField
            label="第一則心得"
            optional
            multiline
            max={NOTE_BODY_MAX}
            value={note}
            onChangeText={setNote}
            placeholder="讀到哪、想到什麼都可以"
            hint="之後可以隨時再補一則，累積成閱讀時間軸。"
          />
          )}

          {status !== 'want' ? (
          <View style={[styles.switchRow, { backgroundColor: c.surface }]}>
            <View style={{ flex: 1 }}>
              <AppText variant="label">顯示在書店頁</AppText>
              <AppText variant="caption" muted>讀者可以在「店主閱讀」看到</AppText>
            </View>
            <Switch accessibilityLabel="顯示在書店頁" value={publicValue} onValueChange={setIsPublic} />
          </View>
          ) : (
            <AppText variant="caption" muted>想讀清單只有你自己看得到。</AppText>
          )}

          <Button label={status === 'want' ? '加入想讀' : '加入店主閱讀'} disabled={!book} loading={add.isPending || upsertWant.isPending} onPress={submit} />
        </ScrollView>
      </KeyboardAvoidingView>

      <BookPicker
        visible={pickerOpen}
        mode="single"
        storeColor={store.store.color}
        pickedIds={pickedIds}
        suggestions={suggestions?.length ? { label: '最近在你的策展裡', books: suggestions } : undefined}
        onClose={() => setPickerOpen(false)}
        onAdd={async (b) => setBook(b)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bookField: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, minHeight: 56 },
  segment: { flexDirection: 'row', borderRadius: Radius.md, padding: 3 },
  segmentItem: { flex: 1, minHeight: MinTouch, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg },
});
