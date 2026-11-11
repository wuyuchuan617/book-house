import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { KindChip, NoteBody, NotePhotos } from '@/components/note-card';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { noteTime } from '@/lib/period';
import { tr } from '@/lib/i18n';
import { useMyStore } from '@/lib/queries';
import { readingError, useDeleteNote, useMyReading } from '@/lib/readings';


/** R10 心得詳情（店主）：全文、大圖；右上編輯，最下面刪除 */
export default function NoteDetailScreen() {
  const { id, readingId } = useLocalSearchParams<{ id: string; readingId: string }>();
  const c = useTheme();
  const { data: r, isLoading } = useMyReading(readingId);
  const { data: store } = useMyStore();
  const del = useDeleteNote();
  const note = r?.reading_notes.find((n) => n.id === id);

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!r || !note || !store) return <EmptyState title={tr('找不到這則心得')} body={tr('它可能已經被刪除了。')} />;

  const remove = () =>
    Alert.alert(tr('刪除這則心得？'), tr('刪除後無法復原。'), [
      { text: tr('取消'), style: 'cancel' },
      {
        text: tr('刪除'),
        style: 'destructive',
        onPress: () => del.mutate({ id: note.id, photoPaths: note.photo_paths }, { onSuccess: () => router.back(), onError: (e) => Alert.alert(tr('沒有成功'), readingError(e.message)) }),
      },
    ]);

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: tr('心得'),
          headerRight: () => (
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/reading/compose', params: { readingId: r.id, noteId: note.id } })} style={{ minHeight: MinTouch, justifyContent: 'center', paddingHorizontal: Spacing.sm }}>
              <AppText style={{ color: c.primary, fontWeight: '700' }}>{tr('編輯')}</AppText>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg, paddingBottom: 48 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <KindChip kind={note.kind} />
          <AppText variant="caption" muted>{`${noteTime(note.created_at)} · ${r.is_public ? tr('公開在書店頁') : tr('只有自己看得到')}`}</AppText>
        </View>
        {note.title ? <AppText variant="title">{note.title}</AppText> : null}
        <NoteBody note={note} />
        <NotePhotos paths={note.photo_paths} full />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: c.surface, borderRadius: Radius.md, padding: Spacing.md }}>
          <BookCover title={r.books.title} url={r.books.cover_url} color={store.store.color} size="sm" />
          <AppText variant="label" style={{ flex: 1 }}>{r.books.title}</AppText>
        </View>
        <Pressable accessibilityRole="button" onPress={remove} style={{ minHeight: MinTouch, alignItems: 'center', justifyContent: 'center' }}>
          <AppText style={{ color: c.danger, fontWeight: '600' }}>{tr('刪除這則心得')}</AppText>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
