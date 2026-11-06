import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { BookSearchPanel, ManualBookForm } from '@/components/book-picker';
import { AppText, Button, Screen } from '@/components/ui';
import { MinTouch, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError, sortedItems, useAddItem, useCuration, usePublishCuration, type Book } from '@/lib/curations';
import { useMyStore } from '@/lib/queries';

/** O4 開店步驟 3：放上書架。1 本就能發布，推薦理由之後再補（O7） */
export default function OpenStoreShelfScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const { data: cur } = useCuration(id);
  const { data: store } = useMyStore();
  const add = useAddItem();
  const publish = usePublishCuration();
  const [manualQuery, setManualQuery] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const items = useMemo(() => (cur ? sortedItems(cur) : []), [cur]);
  const picked = useMemo(() => new Set(items.map((it) => it.books.id)), [items]);

  if (!cur || !store) return <ActivityIndicator style={{ marginTop: 48 }} />;
  const color = store.store.color;

  const addBook = (book: Book) => {
    setBusyId(book.id);
    add.mutate(
      { curationId: cur.id, bookId: book.id },
      {
        onSuccess: () => setManualQuery(null),
        onError: (e) => Alert.alert('沒有加入成功', friendlyError(e.message)),
        onSettled: () => setBusyId(null),
      },
    );
  };

  const finish = () =>
    publish.mutate(cur.id, {
      onSuccess: () => router.replace({ pathname: '/open-store/done', params: { id: cur.id } }),
      onError: (e) => Alert.alert('沒有發布成功', friendlyError(e.message)),
    });

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: '開店',
          headerBackTitle: '上一步',
          headerRight: () => (
            <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: '/open-store/done', params: { id: cur.id, skipped: '1' } })} style={styles.skip}>
              <AppText style={{ color: c.primary, fontWeight: '700' }}>略過</AppText>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
          <AppText variant="caption" muted>步驟 3 / 3 · 放上書架</AppText>
          <AppText variant="title">{`「${cur.title ?? '這檔策展'}」放哪些書？`}</AppText>
          <AppText muted>1 本就能發布，建議 3–7 本。推薦理由之後再補。</AppText>

          <View style={{ gap: Spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="label">{`書架 · ${items.length} 本`}</AppText>
              {items.length ? <AppText variant="caption" style={{ color: c.success, fontWeight: '700' }}>✓ 可以發布了</AppText> : null}
            </View>
            {items.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
                {items.map((it) => (
                  <View key={it.id} style={{ width: 64, gap: 4 }} accessible accessibilityLabel={it.books.title}>
                    <BookCover title={it.books.title} url={it.books.cover_url} color={color} size="md" />
                    <AppText variant="caption" numberOfLines={2}>{it.books.title}</AppText>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <AppText variant="caption" muted>還沒有書。搜尋書名或作者，按「加入」就會放上書架。</AppText>
            )}
          </View>

          {manualQuery !== null ? (
            <View style={{ gap: Spacing.md }}>
              <AppText variant="heading">手動新增書籍</AppText>
              <ManualBookForm initialTitle={manualQuery} storeColor={color} onCreated={addBook} />
              <Button kind="link" label="回到搜尋" onPress={() => setManualQuery(null)} />
            </View>
          ) : (
            <BookSearchPanel
              storeColor={color}
              mode="multi"
              isPicked={(b) => picked.has(b.id)}
              onPick={addBook}
              onManual={setManualQuery}
              busyId={busyId}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Button label="發布策展，完成開店" disabled={items.length === 0} loading={publish.isPending} onPress={finish} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skip: { minHeight: MinTouch, minWidth: MinTouch, justifyContent: 'center', alignItems: 'flex-end' },
  footer: { padding: Spacing.xl, paddingBottom: 34, borderTopWidth: StyleSheet.hairlineWidth },
});
