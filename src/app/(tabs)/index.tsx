import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { Chip } from '@/components/form';
import { FollowButton, StoreAvatar } from '@/components/social';
import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing, StoreColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { EXPLORE_MIN, pickFeatured, useExploreFeed, usePreviousMonthFeed, useSystemTags } from '@/lib/browse';
import { currentPeriod, monthOf, previousPeriod } from '@/lib/period';
import { useMyStore, type ExploreItem } from '@/lib/queries';

/** A2 探索：本月已發布的策展；主題篩選、搜尋（策展、書店、書名、作者）；S3 無結果 */
export default function ExploreScreen() {
  const c = useTheme();
  const [tag, setTag] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const { data: tags } = useSystemTags();
  const { data, isPending, fetchStatus, error, refetch, isRefetching } = useExploreFeed({ tag, query });
  const { data: mine } = useMyStore();

  useEffect(() => {
    const t = setTimeout(() => setQuery(input), 400);
    return () => clearTimeout(t);
  }, [input]);

  const month = monthOf(currentPeriod());
  const tagName = tags?.find((t) => t.slug === tag)?.name;
  const suggest = tags?.find((t) => t.slug !== tag);
  const fill = !query && (data?.length ?? 0) < EXPLORE_MIN && !isPending;
  const { data: previous } = usePreviousMonthFeed({ tag, enabled: fill });
  const prevItems = fill ? (previous ?? []) : [];
  const current = data ?? [];
  const first = query ? current[0] : pickFeatured(current) ?? prevItems[0];
  const rest = (query ? current : [...current, ...prevItems]).filter((i) => i.curation_id !== first?.curation_id);
  const prevStart = rest.findIndex((i) => i.period !== currentPeriod());

  const empty = query ? (
    <View style={{ paddingTop: 48, alignItems: 'center', gap: Spacing.sm }}>
      <AppText variant="heading" style={{ textAlign: 'center' }}>{`找不到「${query}」`}</AppText>
      <AppText muted style={{ textAlign: 'center' }}>{`${tagName ? `「${tagName}」主題裡` : ''}目前還沒有書店策展這本書。\n試試其他關鍵字，或看看熱門主題。`}</AppText>
      {suggest ? <Button label={`看看${suggest.name}主題`} style={{ alignSelf: 'stretch', marginTop: Spacing.lg }} onPress={() => { setInput(''); setQuery(''); setTag(suggest.slug); }} /> : null}
      <Button kind="link" label="清除搜尋" onPress={() => { setInput(''); setQuery(''); }} />
    </View>
  ) : tag ? (
    <EmptyState title={`本月還沒有「${tagName ?? ''}」的策展`} body="換個主題看看，或回到全部。" actionLabel="看全部策展" onAction={() => setTag(undefined)} />
  ) : (
    <EmptyState title="這個月還沒有策展" body="第一間書店開張後，策展就會出現在這裡。" actionLabel="開一間自己的書店" onAction={() => router.navigate('/my-store')} />
  );

  return (
    <Screen>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={styles.header}>
          <AppText variant="title">探索</AppText>
          <AppText variant="caption" muted>{`${month} 月 · ${query || tag ? `${data?.length ?? 0} 檔符合` : `${data?.length ?? 0} 檔新策展`}`}</AppText>
        </View>
        <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Feather name="search" size={18} color={c.textSecondary} />
          <TextInput
            accessibilityLabel="搜尋策展、書店或書名"
            placeholder="搜尋策展、書店或書名"
            placeholderTextColor={c.textTertiary}
            value={input}
            onChangeText={setInput}
            returnKeyType="search"
            onSubmitEditing={() => setQuery(input)}
            style={[styles.searchInput, { color: c.text }]}
          />
          {input ? (
            <Pressable accessibilityRole="button" accessibilityLabel="清除搜尋" onPress={() => { setInput(''); setQuery(''); }} style={styles.clear}>
              <Feather name="x-circle" size={18} color={c.textTertiary} />
            </Pressable>
          ) : null}
        </View>
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tags} accessibilityRole="tablist">
            <Chip label="全部" selected={!tag} onPress={() => setTag(undefined)} />
            {tags?.map((t) => <Chip key={t.slug} label={t.name} selected={tag === t.slug} onPress={() => setTag(tag === t.slug ? undefined : t.slug)} />)}
          </ScrollView>
        </View>

        {isPending && fetchStatus === 'paused' ? (
          <EmptyState title="目前沒有網路連線" body="連上網路後會自動重新載入。" actionLabel="重試" onAction={() => refetch()} />
        ) : isPending ? (
          <ActivityIndicator style={{ marginTop: 48 }} />
        ) : error ? (
          <EmptyState title="目前沒有網路連線" body="連上網路後再試一次。" actionLabel="重試" onAction={() => refetch()} />
        ) : (
          <FlatList
            data={rest}
            keyExtractor={(item) => item.curation_id}
            contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xxl, gap: Spacing.md, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
            ListHeaderComponent={
              first ? (
                <View style={{ gap: Spacing.md }}>
                  <FeaturedCard item={first} ownStoreId={mine?.store.id} />
                  {rest.length && prevStart !== 0 ? <AppText variant="label" style={{ marginTop: Spacing.md }}>{query || tag ? '其他符合的策展' : '更多本月策展'}</AppText> : null}
                </View>
              ) : undefined
            }
            renderItem={({ item, index }) => (
              <>
                {!query && index === prevStart ? (
                  <AppText variant="label" style={{ marginTop: Spacing.md }}>{`${monthOf(previousPeriod())} 月的策展`}</AppText>
                ) : null}
                <CompactCard item={item} />
              </>
            )}
            ListEmptyComponent={first ? undefined : empty}
          />
        )}
      </SafeAreaView>
    </Screen>
  );
}

const openStore = (slug: string) => router.push({ pathname: '/store/[slug]', params: { slug } });

function FeaturedCard({ item, ownStoreId }: { item: ExploreItem; ownStoreId?: string }) {
  const color = StoreColors[item.color]?.hex ?? StoreColors.moss.hex;
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Pressable accessibilityRole="link" accessibilityLabel={`${item.title}，${item.store_name}的策展，${item.book_count} 本書`} onPress={() => openStore(item.slug)}>
        <View style={[styles.band, { backgroundColor: color }]}>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            {item.cover_titles.slice(0, 3).map((t, i) => (
              <View key={`${t}-${i}`} style={styles.coverFrame}>
                <BookCover title={t} url={item.cover_urls[i]} color={item.color} size="md" />
              </View>
            ))}
          </View>
          <AppText variant="caption" style={styles.bandText}>{`${item.book_count} 本書`}</AppText>
        </View>
        <View style={{ padding: Spacing.lg, paddingBottom: 0, gap: Spacing.xs }}>
          <AppText variant="heading">{item.title}</AppText>
          {item.description ? <AppText muted numberOfLines={3}>{item.description}</AppText> : null}
        </View>
      </Pressable>
      <View style={styles.storeRow}>
        <Pressable accessibilityRole="link" onPress={() => openStore(item.slug)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: MinTouch }}>
          <StoreAvatar name={item.store_name} color={item.color} size={32} path={item.avatar_path} />
          <View style={{ flex: 1 }}>
            <AppText variant="label">{item.store_name}</AppText>
            <AppText variant="caption" muted>{`${item.owner_name} · ${item.follower_count} 人追蹤`}</AppText>
          </View>
        </Pressable>
        {item.bookstore_id !== ownStoreId ? <FollowButton bookstoreId={item.bookstore_id} storeName={item.store_name} /> : null}
      </View>
    </Card>
  );
}

function CompactCard({ item }: { item: ExploreItem }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => openStore(item.slug)} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      <Card style={{ flexDirection: 'row', gap: Spacing.md, alignItems: 'center' }}>
        <BookCover title={item.cover_titles[0] ?? item.title} url={item.cover_urls[0]} color={item.color} size="md" />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" style={{ fontSize: 16 }}>{item.title}</AppText>
          {item.description ? <AppText variant="caption" muted numberOfLines={1}>{item.description}</AppText> : null}
          <AppText variant="caption" muted>{`${item.store_name} · ${item.book_count} 本書 · ${item.follower_count} 人追蹤`}</AppText>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  search: { marginHorizontal: Spacing.xl, marginTop: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, paddingLeft: 14, minHeight: 48 },
  searchInput: { flex: 1, fontSize: 16, minHeight: 48, outlineWidth: 0 },
  clear: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center' },
  tags: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.sm },
  band: { minHeight: 150, padding: Spacing.lg, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  bandText: { color: '#FFFFFF', fontWeight: '700' },
  coverFrame: { borderRadius: 4, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)' },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.lg },
});
