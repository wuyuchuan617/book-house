import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';

import { NoteForm } from '@/components/book-picker';
import { AppText, Screen } from '@/components/ui';
import { MinTouch, Spacing, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError, sortedItems, useCuration, useUpdateItemNote, type Curation, type CurationItem } from '@/lib/curations';
import { useMyStore } from '@/lib/queries';

/** O7 補推薦理由（逐本）：只列還沒寫理由的書，可逐本略過 */
export default function OpenStoreReasonsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: cur } = useCuration(id);
  const { data: store } = useMyStore();
  if (!cur || !store) return <ActivityIndicator style={{ marginTop: 48 }} />;
  return <ReasonsFlow cur={cur} color={store.store.color} />;
}

function ReasonsFlow({ cur, color }: { cur: Curation; color: StoreColor }) {
  const c = useTheme();
  const save = useUpdateItemNote();
  // 進來時鎖定要補的清單，避免存檔後清單跳動
  const [queue] = useState<CurationItem[]>(() => sortedItems(cur).filter((it) => !it.note));
  const [index, setIndex] = useState(0);
  const all = sortedItems(cur);
  const item = queue[index];
  const last = index >= queue.length - 1;
  const advance = () => (last ? router.back() : setIndex((i) => i + 1));

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: queue.length ? `推薦理由 · ${Math.min(index + 1, queue.length)} / ${queue.length}` : '推薦理由',
          headerRight: () => (
            <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.later}>
              <AppText style={{ color: c.primary, fontWeight: '700' }}>稍後再寫</AppText>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl }} keyboardShouldPersistTaps="handled">
          {!item ? (
            <AppText muted>每本書都有推薦理由了。</AppText>
          ) : (
            <NoteForm
              key={item.id}
              book={item.books}
              storeColor={color}
              caption={`「${cur.title}」第 ${all.findIndex((x) => x.id === item.id) + 1} 本`}
              prompts={['適合誰讀', '最難忘的一段', '讀完我做了什麼']}
              skipLabel="略過這本"
              submitLabel={last ? '完成' : '下一本 →'}
              saving={save.isPending}
              onSkip={advance}
              onSubmit={(note) => {
                if (!note.trim()) return advance();
                save.mutate(
                  { curationId: cur.id, itemId: item.id, note },
                  { onSuccess: advance, onError: (e) => Alert.alert('沒有儲存成功', friendlyError(e.message)) },
                );
              }}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  later: { minHeight: MinTouch, justifyContent: 'center' },
});
