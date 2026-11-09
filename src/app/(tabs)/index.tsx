import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { Chip } from '@/components/form';
import { PlacesExplore } from '@/components/places-explore';
import { FollowButton, StoreAvatar } from '@/components/social';
import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing, StoreColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import {
  EXPLORE_MIN,
  pickFeatured,
  useExploreFeed,
  useExploreList,
  useExploreMonths,
  usePreviousMonthFeed,
  useSystemTags,
  type ExploreSort,
} from '@/lib/browse';
import { currentPeriod, monthOf, periodLabel, previousPeriod } from '@/lib/period';
import { useMyStore, type ExploreItem } from '@/lib/queries';
import { tagLabel, tr } from '@/lib/i18n';

type Tab = 'curations' | 'places';
type FeedCard = ExploreItem & { visited?: boolean; is_following?: boolean };

const SORTS = (): [ExploreSort, string][] => [['recommend', tr('推薦')], ['latest', tr('最新')], ['popular', tr('熱門')]];

/**
 * A2 探索：上方「策展／書的地方」分頁；策展可勾「追蹤中」「沒逛過」、月份切換、推薦／最新／熱門、已逛過（標示、可只看沒逛過）、
 * 主題篩選、搜尋（所有月份）；本月不到 6 檔時用上個月補位（S3 無結果）；M10「書的地方」（L2）
 */
export default function ExploreScreen() {
  const c = useTheme();
  const { session, requireAuth } = useAuth();
  const [tab, setTab] = useState<Tab>('curations');
  const [following, setFollowing] = useState(false);
  const [period, setPeriod] = useState(currentPeriod());
  const [sort, setSort] = useState<ExploreSort>('recommend');
  const [unvisitedOnly, setUnvisitedOnly] = useState(false);
  const [tag, setTag] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const { data: tags } = useSystemTags();
  const { data: months } = useExploreMonths();
  const { data: mine } = useMyStore();

  useEffect(() => {
    const t = setTimeout(() => setQuery(input), 400);
    return () => clearTimeout(t);
  }, [input]);

  const list = useExploreList({ period: following ? null : period, sort, tag, following, unvisitedOnly });
  const search = useExploreFeed({ tag, query });
  const isCurrent = period === currentPeriod();
  const fill = !query && !following && isCurrent && !unvisitedOnly && !list.isPending && (list.data?.length ?? 0) < EXPLORE_MIN;
  const { data: previous } = usePreviousMonthFeed({ tag, enabled: fill });

  const { first, rest, prevStart } = useMemo(() => {
    if (query) {
      const r = (search.data ?? []) as FeedCard[];
      return { first: undefined, rest: r, prevStart: -1 };
    }
    const cur = (list.data ?? []) as FeedCard[];
    const prev = fill ? ((previous ?? []) as FeedCard[]).filter((p) => !cur.some((x) => x.curation_id === p.curation_id)) : [];
    const showFeatured = !following && sort === 'recommend' && isCurrent;
    const f = showFeatured ? (pickFeatured(cur.filter((x) => !x.visited)) ?? pickFeatured(cur) ?? prev[0]) : undefined;
    const all = [...cur, ...prev].filter((x) => x.curation_id !== f?.curation_id);
    return { first: f, rest: all, prevStart: all.findIndex((x) => prev.includes(x)) };
  }, [query, search.data, list.data, previous, fill, following, sort, isCurrent]);

  const loading = query ? search.isPending : list.isPending && list.fetchStatus !== 'idle';
  const paused = (query ? search.fetchStatus : list.fetchStatus) === 'paused';
  const refetch = () => void (query ? search.refetch() : list.refetch());

  // 月份切換：只能切到有策展的月份（本月一定可選）
  const periods = useMemo(() => {
    const ps = new Set((months ?? []).map((m) => m.period));
    ps.add(currentPeriod());
    return [...ps].sort().reverse();
  }, [months]);
  const idx = periods.indexOf(period);
  const older = idx >= 0 && idx < periods.length - 1 ? periods[idx + 1] : null;
  const newer = idx > 0 ? periods[idx - 1] : null;

  const tagRow = tags?.find((t) => t.slug === tag);
  const tagName = tagRow ? tagLabel(tagRow) : undefined;
  const suggest = tags?.find((t) => t.slug !== tag);
  const count = query ? (search.data?.length ?? 0) : (list.data?.length ?? 0);

  const empty = query ? (
    <View style={{ paddingTop: 48, alignItems: 'center', gap: Spacing.sm }}>
      <AppText variant="heading" style={{ textAlign: 'center' }}>{tr('找不到「{query}」', { query })}</AppText>
      <AppText muted style={{ textAlign: 'center' }}>{tr('{p0}目前還沒有書店策展這本書。\n試試其他關鍵字，或看看熱門主題。', { p0: tagName ? tr('「{tagName}」主題裡', { tagName }) : '' })}</AppText>
      {suggest ? <Button label={tr('看看{name}主題', { name: tagLabel(suggest) })} style={{ alignSelf: 'stretch', marginTop: Spacing.lg }} onPress={() => { setInput(''); setQuery(''); setTag(suggest.slug); }} /> : null}
      <Button kind="link" label={tr('清除搜尋')} onPress={() => { setInput(''); setQuery(''); }} />
    </View>
  ) : following && !session ? (
    <EmptyState title={tr('登入後看追蹤中的書店')} body={tr('追蹤喜歡的店主，新策展上架時會出現在這裡。')} actionLabel={tr('登入')} onAction={() => requireAuth(() => {})} />
  ) : following ? (
    <EmptyState title={unvisitedOnly ? tr('追蹤的書店都逛過了') : tr('還沒有追蹤的書店')} body={unvisitedOnly ? tr('有新策展上架時會出現在這裡。') : tr('在書店頁按「追蹤」，他們的策展會集中在這裡。')} actionLabel={tr('看全部策展')} onAction={() => setFollowing(false)} />
  ) : unvisitedOnly ? (
    <EmptyState title={tr('這個月的策展都逛過了')} body={tr('看看其他月份，或關掉「沒逛過」。')} actionLabel={tr('顯示全部')} onAction={() => setUnvisitedOnly(false)} />
  ) : tag ? (
    <EmptyState title={tr('{p0} 月還沒有「{p1}」的策展', { p0: monthOf(period), p1: tagName ?? '' })} body={tr('換個主題看看，或回到全部。')} actionLabel={tr('看全部策展')} onAction={() => setTag(undefined)} />
  ) : (
    <EmptyState title={tr('{p0} 月還沒有策展', { p0: monthOf(period) })} body={tr('第一間書店開張後，策展就會出現在這裡。')} actionLabel={tr('開一間自己的書店')} onAction={() => router.navigate('/my-store')} />
  );

  const segment = (
    <View style={[styles.tabs, { borderBottomColor: c.border }]} accessibilityRole="tablist">
      {([['curations', tr('策展')], ['places', tr('書的地方')]] as const).map(([t, label]) => (
        <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => setTab(t)} style={[styles.tab, tab === t && { borderBottomColor: c.text }]}>
          <AppText style={{ fontSize: 15, fontWeight: tab === t ? '700' : '500', color: tab === t ? c.text : c.textSecondary }}>{label}</AppText>
        </Pressable>
      ))}
    </View>
  );

  if (tab === 'places') {
    return (
      <Screen>
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <View style={styles.header}>
            <AppText variant="title">{tr('探索')}</AppText>
          </View>
          {segment}
          <PlacesExplore />
        </SafeAreaView>
      </Screen>
    );
  }

  return (
    <Screen>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={styles.header}>
          <AppText variant="title">{tr('探索')}</AppText>
          {!following && !query ? (
            <View style={styles.month}>
              <Pressable accessibilityRole="button" accessibilityLabel={tr('上一個月')} disabled={!older} onPress={() => older && setPeriod(older)} style={[styles.arrow, { opacity: older ? 1 : 0.3 }]}>
                <Feather name="chevron-left" size={20} color={c.text} />
              </Pressable>
              <AppText variant="label" accessibilityLiveRegion="polite">{isCurrent ? tr('{p0} 月 · 本月', { p0: monthOf(period) }) : periodLabel(period)}</AppText>
              <Pressable accessibilityRole="button" accessibilityLabel={tr('下一個月')} disabled={!newer} onPress={() => newer && setPeriod(newer)} style={[styles.arrow, { opacity: newer ? 1 : 0.3 }]}>
                <Feather name="chevron-right" size={20} color={c.text} />
              </Pressable>
            </View>
          ) : (
            <AppText variant="caption" muted>{query ? tr('{count} 檔符合（所有月份）', { count }) : tr('{count} 檔', { count })}</AppText>
          )}
        </View>

        {segment}

        <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Feather name="search" size={18} color={c.textSecondary} />
          <TextInput
            accessibilityLabel={tr('搜尋策展、書店或書名')}
            placeholder={tr('搜尋策展、書店或書名')}
            placeholderTextColor={c.textTertiary}
            value={input}
            onChangeText={setInput}
            returnKeyType="search"
            onSubmitEditing={() => setQuery(input)}
            style={[styles.searchInput, { color: c.text }]}
          />
          {input ? (
            <Pressable accessibilityRole="button" accessibilityLabel={tr('清除搜尋')} onPress={() => { setInput(''); setQuery(''); }} style={styles.clear}>
              <Feather name="x-circle" size={18} color={c.textTertiary} />
            </Pressable>
          ) : null}
        </View>

        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tags}>
            <Chip label={tr('全部主題')} selected={!tag} onPress={() => setTag(undefined)} />
            {tags?.map((t) => <Chip key={t.slug} label={tagLabel(t)} selected={tag === t.slug} onPress={() => setTag(tag === t.slug ? undefined : t.slug)} />)}
          </ScrollView>
        </View>

        {!query ? (
          <View style={styles.sortRow}>
            <View style={{ flexDirection: 'row', gap: Spacing.md }} accessibilityRole="radiogroup">
              {SORTS().map(([s, label]) => (
                <Pressable key={s} accessibilityRole="radio" accessibilityState={{ selected: sort === s }} onPress={() => setSort(s)} hitSlop={8} style={styles.sortItem}>
                  <AppText variant="caption" style={{ fontWeight: sort === s ? '700' : '500', color: sort === s ? c.primary : c.textSecondary }}>{label}</AppText>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: Spacing.md }}>
              <Pressable accessibilityRole="switch" accessibilityState={{ checked: following }} onPress={() => requireAuth(() => setFollowing(!following))} hitSlop={8} style={styles.sortItem}>
                <Feather name={following ? 'check-square' : 'square'} size={16} color={following ? c.primary : c.textSecondary} />
                <AppText variant="caption" style={{ color: following ? c.primary : c.textSecondary, fontWeight: '600' }}>{tr('追蹤中')}</AppText>
              </Pressable>
              <Pressable accessibilityRole="switch" accessibilityState={{ checked: unvisitedOnly }} onPress={() => setUnvisitedOnly(!unvisitedOnly)} hitSlop={8} style={styles.sortItem}>
                <Feather name={unvisitedOnly ? 'check-square' : 'square'} size={16} color={unvisitedOnly ? c.primary : c.textSecondary} />
                <AppText variant="caption" style={{ color: unvisitedOnly ? c.primary : c.textSecondary, fontWeight: '600' }}>{tr('沒逛過')}</AppText>
              </Pressable>
            </View>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 48 }} />
        ) : paused ? (
          <EmptyState title={tr('目前沒有網路連線')} body={tr('連上網路後會自動重新載入。')} actionLabel={tr('重試')} onAction={refetch} />
        ) : (query ? search.error : list.error) ? (
          <EmptyState title={tr('沒有載入成功')} body={tr('檢查網路後再試一次。')} actionLabel={tr('重試')} onAction={refetch} />
        ) : (
          <FlatList
            data={rest}
            keyExtractor={(item) => item.curation_id}
            contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xxl, gap: Spacing.md, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={<RefreshControl refreshing={list.isRefetching || search.isRefetching} onRefresh={refetch} />}
            ListHeaderComponent={
              first ? (
                <View style={{ gap: Spacing.md }}>
                  <FeaturedCard item={first} ownStoreId={mine?.store.id} />
                  {rest.length && prevStart !== 0 ? <AppText variant="label" style={{ marginTop: Spacing.md }}>{tr('更多 {p0} 月策展', { p0: monthOf(period) })}</AppText> : null}
                </View>
              ) : undefined
            }
            renderItem={({ item, index }) => (
              <>
                {index === prevStart ? <AppText variant="label" style={{ marginTop: Spacing.md }}>{tr('{p0} 月的策展', { p0: monthOf(previousPeriod()) })}</AppText> : null}
                <CompactCard item={item} showMonth={!!query || following} />
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

function VisitedBadge() {
  const c = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: c.surfaceMuted }]}>
      <AppText variant="caption" style={{ color: c.textSecondary, fontWeight: '600' }}>{tr('已逛過')}</AppText>
    </View>
  );
}

function FeaturedCard({ item, ownStoreId }: { item: FeedCard; ownStoreId?: string }) {
  const color = StoreColors[item.color]?.hex ?? StoreColors.moss.hex;
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Pressable accessibilityRole="link" accessibilityLabel={tr('{title}，{store_name}的策展，{book_count} 本書{p3}', { title: item.title, store_name: item.store_name, book_count: item.book_count, p3: item.visited ? tr('，已逛過') : '' })} onPress={() => openStore(item.slug)}>
        <View style={[styles.band, { backgroundColor: color }]}>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            {item.cover_titles.slice(0, 3).map((t, i) => (
              <View key={`${t}-${i}`} style={styles.coverFrame}>
                <BookCover title={t} url={item.cover_urls[i]} color={item.color} size="md" />
              </View>
            ))}
          </View>
          <AppText variant="caption" style={styles.bandText}>{tr('{book_count} 本書', { book_count: item.book_count })}</AppText>
        </View>
        <View style={{ padding: Spacing.lg, paddingBottom: 0, gap: Spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <AppText variant="heading" style={{ flex: 1 }}>{item.title}</AppText>
            {item.visited ? <VisitedBadge /> : null}
          </View>
          {item.description ? <AppText muted numberOfLines={3}>{item.description}</AppText> : null}
        </View>
      </Pressable>
      <View style={styles.storeRow}>
        <Pressable accessibilityRole="link" onPress={() => openStore(item.slug)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: MinTouch }}>
          <StoreAvatar name={item.store_name} color={item.color} size={32} path={item.avatar_path} />
          <View style={{ flex: 1 }}>
            <AppText variant="label">{item.store_name}</AppText>
            <AppText variant="caption" muted>{tr('{owner_name} · {follower_count} 人追蹤', { owner_name: item.owner_name, follower_count: item.follower_count })}</AppText>
          </View>
        </Pressable>
        {item.bookstore_id !== ownStoreId ? <FollowButton bookstoreId={item.bookstore_id} storeName={item.store_name} /> : null}
      </View>
    </Card>
  );
}

function CompactCard({ item, showMonth }: { item: FeedCard; showMonth?: boolean }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={tr('{title}，{store_name}{p2}', { title: item.title, store_name: item.store_name, p2: item.visited ? tr('，已逛過') : '' })}
      onPress={() => openStore(item.slug)}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : item.visited ? 0.72 : 1 })}>
      <Card style={{ flexDirection: 'row', gap: Spacing.md, alignItems: 'center' }}>
        <BookCover title={item.cover_titles[0] ?? item.title} url={item.cover_urls[0]} color={item.color} size="md" />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <AppText variant="label" style={{ fontSize: 16, flexShrink: 1 }}>{item.title}</AppText>
            {item.visited ? <VisitedBadge /> : null}
          </View>
          {item.description ? <AppText variant="caption" muted numberOfLines={1}>{item.description}</AppText> : null}
          <AppText variant="caption" muted>
            {[showMonth ? tr('{p0} 月', { p0: monthOf(item.period) }) : null, item.store_name, tr('{book_count} 本書', { book_count: item.book_count })].filter(Boolean).join(' · ')}
            {item.is_following ? <AppText variant="caption" style={{ color: c.primary }}>{tr(' · 追蹤中')}</AppText> : null}
          </AppText>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { flexDirection: 'row', alignItems: 'center' },
  arrow: { width: MinTouch - 4, height: MinTouch, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: Spacing.xxl, marginHorizontal: Spacing.xl, marginTop: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { minHeight: MinTouch, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -StyleSheet.hairlineWidth },
  search: { marginHorizontal: Spacing.xl, marginTop: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, paddingLeft: 14, minHeight: 48 },
  searchInput: { flex: 1, fontSize: 16, minHeight: 48, outlineWidth: 0 },
  clear: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center' },
  tags: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.sm },
  sortRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm },
  sortItem: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 4 },
  band: { minHeight: 150, padding: Spacing.lg, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  bandText: { color: '#FFFFFF', fontWeight: '700' },
  coverFrame: { borderRadius: 4, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)' },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.lg },
  badge: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
});
