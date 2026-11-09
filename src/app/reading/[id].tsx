import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { NoteTimeline } from '@/components/note-card';
import { SaveButton, StoreAvatar } from '@/components/social';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useReading } from '@/lib/browse';
import { tr } from '@/lib/i18n';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** A5 店主閱讀・心得時間軸（讀者） */
export default function ReadingNotesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useReading(id);

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!data || !data.store) return <EmptyState title={tr('看不到這筆閱讀紀錄')} body={tr('店主可能改成私人，或已經移除。')} />;
  const { reading: r, store } = data;
  const notes = r.reading_notes;

  return (
    <Screen>
      <Stack.Screen options={{ title: store.name }} />
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }}>
        <AppText variant="caption" muted>{r.status === 'reading' ? tr('店主正在讀') : tr('店主讀完了{p0}', { p0: r.finished_at ? ` · ${md(r.finished_at)}` : '' })}</AppText>
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/book/[id]', params: { id: r.books.id } })} style={{ flexDirection: 'row', gap: Spacing.lg }}>
          <BookCover title={r.books.title} url={r.books.cover_url} color={store.color} size="lg" />
          <View style={{ flex: 1, justifyContent: 'center', gap: 4 }}>
            <AppText variant="heading">{r.books.title}</AppText>
            <AppText muted>{r.books.authors.join(tr('、'))}</AppText>
          </View>
        </Pressable>
        <SaveButton bookId={r.books.id} title={r.books.title} bookstoreId={store.id} withLabel />

        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: store.slug, tab: 'reading' } })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm }}>
          <StoreAvatar name={store.name} color={store.color} size={28} />
          <AppText variant="label">{tr('{owner_name} 的閱讀心得 · {length} 則', { owner_name: store.owner_name, length: notes.length })}</AppText>
        </Pressable>

        <NoteTimeline notes={notes} startedAt={r.started_at} />
      </ScrollView>
    </Screen>
  );
}
