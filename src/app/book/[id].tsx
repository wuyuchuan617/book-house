import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { SaveButton, StoreAvatar } from '@/components/social';
import { AppText, Card, EmptyState, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useBook } from '@/lib/browse';
import { monthOf } from '@/lib/period';
import { tr } from '@/lib/i18n';

/** 書籍視角：這本書被哪些書店推薦、各自怎麼說 */
export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useBook(id);

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!data?.book) return <EmptyState title={tr('找不到這本書')} body={tr('它可能已經被合併或移除。')} />;
  const { book, appearances } = data;
  const curations = appearances.filter((a) => a.kind === 'curation');
  const readers = appearances.filter((a) => a.kind === 'reading');
  const first = appearances[0];

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }}>
        <View style={{ flexDirection: 'row', gap: Spacing.lg }}>
          <BookCover title={book.title} url={book.cover_url} color={first?.color ?? 'moss'} size="lg" />
          <View style={{ flex: 1, justifyContent: 'center', gap: 4 }}>
            <AppText variant="heading">{book.title}</AppText>
            <AppText muted>{[book.authors.join(tr('、')), book.published_year].filter(Boolean).join(' · ')}</AppText>
          </View>
        </View>
        <SaveButton bookId={book.id} title={book.title} curationId={first?.curation_id} bookstoreId={first?.bookstore_id} withLabel />

        <AppText variant="label" style={{ marginTop: Spacing.sm }}>
          {curations.length ? tr('{length} 間書店推薦過這本書', { length: curations.length }) : tr('還沒有書店把這本書放進策展')}
        </AppText>
        {curations.map((a) => (
          <Pressable key={`${a.curation_id}`} accessibilityRole="link" onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: a.slug } })}>
            <Card style={{ gap: Spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <StoreAvatar name={a.store_name} color={a.color} size={32} />
                <View style={{ flex: 1 }}>
                  <AppText variant="label">{a.store_name}</AppText>
                  <AppText variant="caption" muted>{`${a.period ? tr('{p0} 月 · ', { p0: monthOf(a.period) }) : ''}${a.curation_title ?? ''}`}</AppText>
                </View>
              </View>
              {a.note ? <AppText style={{ lineHeight: 23 }}>{tr('「{note}」', { note: a.note })}</AppText> : <AppText variant="caption" muted>{tr('沒有寫推薦理由')}</AppText>}
            </Card>
          </Pressable>
        ))}

        {readers.length ? (
          <>
            <AppText variant="label" style={{ marginTop: Spacing.sm }}>{tr('{length} 位店主讀過或正在讀', { length: readers.length })}</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
              {readers.map((a) => (
                <Pressable
                  key={a.bookstore_id}
                  accessibilityRole="link"
                  onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: a.slug, tab: 'reading' } })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
                  <StoreAvatar name={a.store_name} color={a.color} size={28} />
                  <AppText variant="caption">{a.store_name}</AppText>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
