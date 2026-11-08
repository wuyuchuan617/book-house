import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { SaveButton, StoreAvatar } from '@/components/social';
import { AppText, Card, EmptyState, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReading } from '@/lib/browse';
import { timeAgo } from '@/lib/period';
import { tr } from '@/lib/i18n';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** A5 店主閱讀・心得時間軸（讀者） */
export default function ReadingNotesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
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

        <Card style={{ gap: 0 }}>
          {notes.map((n, i) => (
            <View key={n.id} style={styles.item}>
              <View style={styles.rail}>
                <View style={[styles.dot, { backgroundColor: i === 0 ? c.primary : c.border }]} />
                {i < notes.length - 1 ? <View style={[styles.line, { backgroundColor: c.divider }]} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: Spacing.lg }}>
                <AppText variant="caption" muted>{i === 0 ? timeAgo(n.created_at) : md(n.created_at)}</AppText>
                <AppText style={{ marginTop: 4, lineHeight: 23 }}>{n.body}</AppText>
              </View>
            </View>
          ))}
          <View style={styles.item}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: c.border }]} />
            </View>
            <AppText variant="caption" muted>{tr('{p0} · 開始讀', { p0: md(r.started_at) })}</AppText>
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', gap: Spacing.md },
  rail: { width: 12, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  line: { width: 2, flex: 1, marginTop: 4 },
});
