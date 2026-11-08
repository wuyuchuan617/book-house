import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { Chip, chipRow, TextField } from '@/components/form';
import { AppText, Button, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useStartReading, useToggleSave, useUpsertWant, wantSource, type SavedBook } from '@/lib/browse';
import { userMessage } from '@/lib/errors';

export const SOURCE_SUGGESTIONS = ['朋友推薦', '書店翻到', '網路文章', '讀書會', 'Podcast'];

/** 想讀的一本書：改理由與來源、開始讀（有書店的人）、從想讀移除 */
export function WantSheet({ item, hasStore, onClose }: { item: SavedBook | null; hasStore: boolean; onClose: () => void }) {
  return (
    <Modal visible={!!item} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {item ? <WantForm key={item.book_id} item={item} hasStore={hasStore} onClose={onClose} /> : null}
    </Modal>
  );
}

function WantForm({ item, hasStore, onClose }: { item: SavedBook; hasStore: boolean; onClose: () => void }) {
  const auto = item.source_text ? null : wantSource(item);
  const [note, setNote] = useState(item.note ?? '');
  const [source, setSource] = useState(item.source_text ?? '');
  const save = useUpsertWant();
  const start = useStartReading();
  const remove = useToggleSave();
  const dirty = note.trim() !== (item.note ?? '') || source.trim() !== (item.source_text ?? '');
  const fail = (e: Error) => Alert.alert('沒有成功', userMessage(e));

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
            <AppText variant="caption" muted>想讀</AppText>
            <View style={{ flexDirection: 'row', gap: Spacing.lg }}>
              <BookCover title={item.books.title} url={item.books.cover_url} color={item.bookstores?.color ?? 'moss'} size="lg" />
              <View style={{ flex: 1, justifyContent: 'center', gap: 4 }}>
                <AppText variant="heading">{item.books.title}</AppText>
                <AppText muted>{item.books.authors.join('、')}</AppText>
                <Button kind="link" label="看誰推薦過這本書" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={() => { onClose(); router.push({ pathname: '/book/[id]', params: { id: item.book_id } }); }} />
              </View>
            </View>

            <TextField label="為什麼想讀" optional multiline max={200} value={note} onChangeText={setNote} placeholder="哪一句話、哪個人讓你想讀它？" hint={hasStore ? '開始讀的時候，這段會變成第一則心得。' : undefined} />
            <View style={{ gap: Spacing.sm }}>
              <TextField label="在哪看到" optional max={60} value={source} onChangeText={setSource} placeholder={auto ?? '例如：朋友推薦'} hint={auto && !source ? `目前顯示：${auto}` : undefined} />
              <View style={chipRow}>
                {SOURCE_SUGGESTIONS.map((s) => <Chip key={s} label={s} selected={source === s} onPress={() => setSource(source === s ? '' : s)} />)}
              </View>
            </View>

            {dirty ? (
              <Button label="儲存" loading={save.isPending} onPress={() => save.mutate({ bookId: item.book_id, note, sourceText: source }, { onSuccess: onClose, onError: fail })} />
            ) : null}
            {hasStore ? (
              <Button
                kind={dirty ? 'secondary' : 'primary'}
                label="開始讀"
                loading={start.isPending}
                onPress={async () => {
                  try {
                    if (dirty) await save.mutateAsync({ bookId: item.book_id, note, sourceText: source });
                    await start.mutateAsync(item.book_id);
                    onClose();
                    Alert.alert('已移到「在讀」', '可以在我的書店 › 店主閱讀繼續寫心得。');
                  } catch (e) {
                    fail(e as Error);
                  }
                }}
              />
            ) : null}
            <Button kind="link" label="從想讀移除" onPress={() => remove.mutate({ bookId: item.book_id, save: false }, { onSuccess: onClose, onError: fail })} />
            <Button kind="secondary" label="關閉" onPress={onClose} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Screen>
  );
}
