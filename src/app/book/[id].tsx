import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { SaveButton, StoreAvatar } from '@/components/social';
import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useBook, useStartReading } from '@/lib/browse';
import { userMessage } from '@/lib/errors';
import { bookTitle, tr } from '@/lib/i18n';
import { monthOf, timeAgo } from '@/lib/period';
import { useMyStore } from '@/lib/queries';
import { useAddReading } from '@/lib/readings';
import { useBookMentions } from '@/lib/store-v16';

type Section = 'curations' | 'readers' | 'rx' | 'posts';

/**
 * Y6 書的單頁（v1.7）：作者下面一行「出版社 · 年份 · ISBN」；自己的狀態（想讀／積讀／正在讀／讀完）與對應按鈕；
 * 「這本書出現在」一張卡收齊：策展、店主正在讀、處方簽、貼文，每一列點了展開。
 */
export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const { session, requireAuth } = useAuth();
  const { data, isLoading } = useBook(id);
  const { data: mentions } = useBookMentions(id);
  const { data: mine } = useMyStore();
  const start = useStartReading();
  const add = useAddReading();
  const [open, setOpen] = useState<Section | null>('curations');

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!data?.book) return <EmptyState title={tr('找不到這本書')} body={tr('它可能已經被合併或移除。')} />;
  const { book, appearances } = data;
  const curations = appearances.filter((a) => a.kind === 'curation');
  const readers = appearances.filter((a) => a.kind === 'reading');
  const first = appearances[0];
  const me = mentions?.mine;
  const status = me?.reading ? (me.reading.status === 'finished' ? 'finished' : 'reading') : me?.purchase && me.purchase.status === 'unread' ? 'tbr' : me?.want ? 'want' : null;
  const STATUS: Record<string, string> = { want: tr('想讀'), tbr: tr('積讀'), reading: tr('正在讀'), finished: tr('讀完了') };
  const fail = (e: Error) => Alert.alert(tr('沒有成功'), userMessage(e));
  const startReading = () =>
    requireAuth(() =>
      status === 'want'
        ? start.mutate(book.id, { onError: fail })
        : add.mutate({ bookId: book.id, status: 'reading', isPublic: mine?.store.reading_public_default ?? true }, { onError: fail }),
    );
  const buy = () => requireAuth(() => router.push({ pathname: '/purchase', params: { bookId: book.id } }));
  const toggle = (s: Section) => setOpen(open === s ? null : s);
  const rx = mentions?.rx ?? [];
  const posts = mentions?.posts ?? [];

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg, paddingBottom: 48 }}>
        <View style={{ flexDirection: 'row', gap: Spacing.lg }}>
          <BookCover title={book.title} url={book.cover_url} color={first?.color ?? 'moss'} size="lg" />
          <View style={{ flex: 1, justifyContent: 'center', gap: 4 }}>
            <AppText variant="heading">{bookTitle(book.title)}</AppText>
            <AppText muted>{book.authors.join(tr('、'))}</AppText>
            <AppText variant="caption" muted>{[book.publisher, book.published_year, book.isbn13 ? `ISBN ${book.isbn13}` : null].filter(Boolean).join(' · ')}</AppText>
            {status ? (
              <View style={[styles.tag, { backgroundColor: c.surfaceMuted }]}>
                <AppText variant="caption" style={{ fontWeight: '700', color: c.primary }}>{STATUS[status]}</AppText>
              </View>
            ) : null}
          </View>
        </View>

        {session ? (
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            {status === null ? (
              <View style={{ flex: 1 }}>
                <SaveButton bookId={book.id} title={book.title} curationId={first?.curation_id} bookstoreId={first?.bookstore_id} withLabel />
              </View>
            ) : status === 'reading' && me?.reading ? (
              <Button label={tr('寫心得')} style={{ flex: 1 }} onPress={() => router.push({ pathname: '/reading/compose', params: { readingId: me.reading!.id } })} />
            ) : status === 'want' || status === 'tbr' ? (
              <Button label={tr('開始讀')} style={{ flex: 1 }} loading={start.isPending || add.isPending} onPress={startReading} />
            ) : null}
            {status === null || status === 'want' ? (
              <Pressable accessibilityRole="button" onPress={buy} style={[styles.buy, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Feather name="shopping-bag" size={16} color={c.text} />
                <AppText style={{ fontWeight: '700' }}>{tr('買了')}</AppText>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <SaveButton bookId={book.id} title={book.title} curationId={first?.curation_id} bookstoreId={first?.bookstore_id} withLabel />
        )}

        <Card style={{ paddingVertical: 4 }}>
          <AppText variant="label" style={{ paddingVertical: Spacing.sm }}>{tr('這本書出現在')}</AppText>
          <Row icon="layers" color={c.primary} title={curations.length ? tr('{n} 檔策展', { n: curations.length }) : tr('還沒有策展')} open={open === 'curations'} onPress={curations.length ? () => toggle('curations') : undefined}>
            {curations.map((a) => (
              <Pressable key={a.curation_id} accessibilityRole="link" onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: a.slug } })} style={styles.item}>
                <StoreAvatar name={a.store_name} color={a.color} size={28} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="caption" style={{ fontWeight: '700' }}>{`${a.store_name}${a.period ? ` · ${tr('{p0} 月', { p0: monthOf(a.period) })}` : ''}`}</AppText>
                  {a.note ? <AppText variant="caption" style={{ lineHeight: 19 }}>{tr('「{note}」', { note: a.note })}</AppText> : null}
                </View>
              </Pressable>
            ))}
          </Row>
          <Row icon="book-open" color={c.success} title={readers.length ? tr('{n} 位店主讀過或正在讀', { n: readers.length }) : tr('還沒有店主在讀')} open={open === 'readers'} onPress={readers.length ? () => toggle('readers') : undefined}>
            {readers.map((a) => (
              <Pressable key={a.bookstore_id} accessibilityRole="link" onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: a.slug, tab: 'reading' } })} style={styles.item}>
                <StoreAvatar name={a.store_name} color={a.color} size={28} />
                <AppText variant="caption" style={{ fontWeight: '700' }}>{a.store_name}</AppText>
              </Pressable>
            ))}
          </Row>
          <Row icon="message-circle" color="#5A4B8A" title={rx.length ? tr('被開進 {n} 張處方簽', { n: rx.length }) : tr('還沒被開進處方簽')} open={open === 'rx'} onPress={rx.length ? () => toggle('rx') : undefined}>
            {rx.map((r) => (
              <Pressable key={r.id} accessibilityRole="link" onPress={() => router.push({ pathname: '/rx/[id]', params: { id: r.id } })} style={styles.item}>
                <AppText variant="caption" style={{ flex: 1, lineHeight: 19 }}>{`℞ ${r.title}`}</AppText>
                <AppText variant="caption" muted>{tr('{n} 人開出', { n: r.count })}</AppText>
              </Pressable>
            ))}
          </Row>
          <Row icon="edit-3" color="#2F5D6B" title={posts.length ? tr('{n} 則貼文提到', { n: posts.length }) : tr('還沒有貼文提到')} open={open === 'posts'} onPress={posts.length ? () => toggle('posts') : undefined} last>
            {posts.map((p) => (
              <Pressable key={`${p.source}-${p.id}`} accessibilityRole="link" disabled={!p.author_store_slug} onPress={() => p.author_store_slug && router.push({ pathname: '/store/[slug]', params: { slug: p.author_store_slug, tab: p.source === 'note' ? 'reading' : 'journal' } })} style={styles.item}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="caption" numberOfLines={2} style={{ lineHeight: 19 }}>{p.body ?? ''}</AppText>
                  <AppText variant="caption" muted>{`${p.author_name} · ${timeAgo(p.created_at)}`}</AppText>
                </View>
              </Pressable>
            ))}
          </Row>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Row({ icon, color, title, open, onPress, last, children }: {
  icon: React.ComponentProps<typeof Feather>['name'];
  color: string;
  title: string;
  open: boolean;
  onPress?: () => void;
  last?: boolean;
  children: React.ReactNode;
}) {
  const c = useTheme();
  return (
    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider, paddingBottom: last ? 4 : 0 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open, disabled: !onPress }} disabled={!onPress} onPress={onPress} style={styles.row}>
        <View style={[styles.icon, { backgroundColor: c.divider }]}>
          <Feather name={icon} size={15} color={color} />
        </View>
        <AppText style={{ flex: 1, fontWeight: '600', color: onPress ? c.text : c.textTertiary }}>{title}</AppText>
        {onPress ? <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.textTertiary} /> : null}
      </Pressable>
      {open ? <View style={{ gap: Spacing.sm, paddingBottom: Spacing.md }}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { alignSelf: 'flex-start', borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  buy: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 16, minHeight: 48 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: MinTouch + 8 },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingLeft: 42, minHeight: 40 },
});
