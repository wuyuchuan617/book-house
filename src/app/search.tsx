import Feather from '@expo/vector-icons/Feather';
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { Chip, chipRow } from '@/components/form';
import { PostCard } from '@/components/posts-explore';
import { RxCard } from '@/components/rx-explore';
import { StoreAvatar } from '@/components/social';
import { AppText, Card, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useExploreFeed } from '@/lib/browse';
import { useBookSearch } from '@/lib/curations';
import { useExplorePosts } from '@/lib/diary';
import { tr } from '@/lib/i18n';
import { monthOf } from '@/lib/period';
import { unwrap, type PublicStore } from '@/lib/queries';
import { useRxSearch } from '@/lib/store-v16';
import { supabase } from '@/lib/supabase';

type Cat = 'all' | 'books' | 'curations' | 'posts' | 'rx' | 'stores';

function useStoreSearch(q: string) {
  return useQuery({
    queryKey: ['store-search', q],
    enabled: q.length > 0,
    queryFn: async () => {
      const pat = `%${q.replace(/[%_]/g, '')}%`;
      return unwrap<PublicStore[]>(await supabase.from('public_bookstores').select('*').or(`name.ilike.${pat},tagline.ilike.${pat}`).limit(20));
    },
  });
}

/**
 * Y11 全域搜尋（v1.7）：每一頁右上的搜尋都開這頁；一次搜書、策展、貼文、處方簽、書店，上面可以切類別。
 * 找不到時給「加入想讀／發起處方簽」。
 */
export default function SearchScreen() {
  const c = useTheme();
  const { session, requireAuth } = useAuth();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Cat>('all');
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);

  const books = useBookSearch(session ? q : '');
  const curations = useExploreFeed({ query: q });
  const posts = useExplorePosts('all', null, q);
  const rx = useRxSearch(q);
  const stores = useStoreSearch(q);
  const has = { books: books.data?.length ?? 0, curations: q ? curations.data?.length ?? 0 : 0, posts: q ? posts.data?.length ?? 0 : 0, rx: rx.data?.length ?? 0, stores: stores.data?.length ?? 0 };
  const loading = !!q && (curations.isPending || posts.isPending || rx.isPending || stores.isPending || (!!session && [...q].length >= 2 && books.isPending));
  const none = !!q && !loading && Object.values(has).every((n) => n === 0);
  const show = (k: Exclude<Cat, 'all'>) => (cat === 'all' || cat === k) && has[k] > 0;
  const limit = cat === 'all' ? 3 : 50;

  const CATS: [Cat, string][] = [
    ['all', tr('全部')],
    ['books', tr('書')],
    ['curations', tr('策展')],
    ['posts', tr('貼文')],
    ['rx', tr('處方簽')],
    ['stores', tr('書店')],
  ];

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={styles.bar}>
          <View style={[styles.input, { backgroundColor: c.surface, borderColor: c.primary }]}>
            <Feather name="search" size={17} color={c.textSecondary} />
            <TextInput
              autoFocus
              value={input}
              onChangeText={setInput}
              returnKeyType="search"
              onSubmitEditing={() => setQ(input.trim())}
              placeholder={tr('搜尋書、策展、貼文、處方簽、書店')}
              placeholderTextColor={c.textTertiary}
              accessibilityLabel={tr('搜尋')}
              style={{ flex: 1, fontSize: 16, color: c.text, minHeight: 44 }}
            />
            {input ? (
              <Pressable accessibilityRole="button" accessibilityLabel={tr('清除搜尋')} hitSlop={8} onPress={() => setInput('')}>
                <Feather name="x-circle" size={17} color={c.textTertiary} />
              </Pressable>
            ) : null}
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8} style={{ minHeight: MinTouch, justifyContent: 'center' }}>
            <AppText style={{ color: c.primary, fontWeight: '700' }}>{tr('取消')}</AppText>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.cats} keyboardShouldPersistTaps="handled">
          {CATS.map(([k, label]) => <Chip key={k} label={label} selected={cat === k} onPress={() => setCat(k)} />)}
        </ScrollView>

        <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md, paddingBottom: 48 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {!q ? (
            <AppText variant="caption" muted>{tr('輸入書名、作者、書店名稱或想找的主題。')}</AppText>
          ) : loading ? (
            <ActivityIndicator style={{ marginTop: 32 }} />
          ) : (
            <>
              {show('books') ? (
                <>
                  <Section title={tr('書 · {n}', { n: has.books })} more={cat === 'all' && has.books > 3 ? () => setCat('books') : undefined} />
                  {books.data!.slice(0, limit).map((b) => (
                    <Pressable key={b.id} accessibilityRole="link" onPress={() => router.push({ pathname: '/book/[id]', params: { id: b.id } })}>
                      <Card style={styles.row}>
                        <BookCover title={b.title} url={b.cover_url} color="moss" size="sm" />
                        <View style={{ flex: 1 }}>
                          <AppText variant="label" numberOfLines={2}>{b.title}</AppText>
                          <AppText variant="caption" muted numberOfLines={1}>{[b.authors.join(tr('、')), b.publisher, b.published_year].filter(Boolean).join(' · ')}</AppText>
                        </View>
                      </Card>
                    </Pressable>
                  ))}
                </>
              ) : null}
              {show('curations') ? (
                <>
                  <Section title={tr('策展 · {n}', { n: has.curations })} more={cat === 'all' && has.curations > 3 ? () => setCat('curations') : undefined} />
                  {curations.data!.slice(0, limit).map((i) => (
                    <Pressable key={i.curation_id} accessibilityRole="link" onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: i.slug } })}>
                      <Card style={styles.row}>
                        <BookCover title={i.cover_titles?.[0] ?? i.title} url={i.cover_urls?.[0] ?? null} color={i.color} size="sm" />
                        <View style={{ flex: 1 }}>
                          <AppText variant="label" numberOfLines={1}>{i.title}</AppText>
                          <AppText variant="caption" muted numberOfLines={1}>{tr('{m} 月 · {store} · {n} 本書', { m: monthOf(i.period), store: i.store_name, n: i.book_count })}</AppText>
                        </View>
                      </Card>
                    </Pressable>
                  ))}
                </>
              ) : null}
              {show('posts') ? (
                <>
                  <Section title={tr('貼文 · {n}', { n: has.posts })} more={cat === 'all' && has.posts > 3 ? () => setCat('posts') : undefined} />
                  {posts.data!.slice(0, limit).map((p) => <PostCard key={p.id} post={p} />)}
                </>
              ) : null}
              {show('rx') ? (
                <>
                  <Section title={tr('處方簽 · {n}', { n: has.rx })} more={cat === 'all' && has.rx > 3 ? () => setCat('rx') : undefined} />
                  {rx.data!.slice(0, limit).map((r) => <RxCard key={r.id} item={r} />)}
                </>
              ) : null}
              {show('stores') ? (
                <>
                  <Section title={tr('書店 · {n}', { n: has.stores })} more={cat === 'all' && has.stores > 3 ? () => setCat('stores') : undefined} />
                  {stores.data!.slice(0, limit).map((s) => (
                    <Pressable key={s.id} accessibilityRole="link" onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: s.slug } })}>
                      <Card style={styles.row}>
                        <StoreAvatar name={s.name} color={s.color} size={40} path={s.avatar_path} />
                        <View style={{ flex: 1 }}>
                          <AppText variant="label" numberOfLines={1}>{s.name}</AppText>
                          <AppText variant="caption" muted numberOfLines={1}>{s.tagline || tr('{n} 人追蹤', { n: s.follower_count })}</AppText>
                        </View>
                      </Card>
                    </Pressable>
                  ))}
                </>
              ) : null}
              <Card style={[styles.none, { borderColor: c.border }]}>
                <AppText variant="label" style={{ textAlign: 'center' }}>{none ? tr('找不到「{query}」', { query: q }) : tr('沒找到想要的？')}</AppText>
                <View style={[chipRow, { justifyContent: 'center' }]}>
                  <Chip label={tr('加入想讀')} selected onPress={() => requireAuth(() => router.push({ pathname: '/want-book', params: { q } }))} />
                  <Chip label={tr('發起處方簽')} onPress={() => requireAuth(() => router.push({ pathname: '/rx/new', params: { title: tr('想找：{q}', { q }) } }))} />
                </View>
              </Card>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

function Section({ title, more }: { title: string; more?: () => void }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: Spacing.xs }}>
      <AppText variant="label" style={{ flex: 1 }}>{title}</AppText>
      {more ? (
        <Pressable accessibilityRole="button" onPress={more} hitSlop={8}>
          <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('看全部 ›')}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  input: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12 },
  cats: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  none: { borderWidth: 1.5, borderStyle: 'dashed', backgroundColor: 'transparent', gap: Spacing.sm, alignItems: 'center', marginTop: Spacing.sm },
});
