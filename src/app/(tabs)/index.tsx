import Feather from '@expo/vector-icons/Feather';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { TeaserStrip } from '@/components/teaser';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { MonthSheet, monthPillLabel } from '@/components/month-sheet';
import { FilterBar, FilterSheet, type ActiveFilter, type FilterGroup } from '@/components/explore-filter';
import { NotificationBell, SearchButton } from '@/components/icon-button';
import { PostsExplore, usePostFilter, type PostKindFilter } from '@/components/posts-explore';
import { RX_FILTERS, RxExplore } from '@/components/rx-explore';
import { FollowButton, StoreAvatar } from '@/components/social';
import { AppText, Card, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing, StoreColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import {
  EXPLORE_MIN,
  pickFeatured,
  useExploreList,
  useExploreMonths,
  usePreviousMonthFeed,
  useSystemTags,
  type ExploreSort,
} from '@/lib/browse';
import { locationAvailable } from '@/lib/location';
import { currentPeriod, monthOf, previousPeriod } from '@/lib/period';
import { RX_TAGS, rxTagLabel, type RxFilter } from '@/lib/rx';
import { useMyStore, type ExploreItem } from '@/lib/queries';
import { tagLabel, tr } from '@/lib/i18n';

type Tab = 'curations' | 'posts' | 'rx';
type FeedCard = ExploreItem & { visited?: boolean; is_following?: boolean };

const KIND_LABEL = (): Record<PostKindFilter, string> => ({ all: tr('全部'), diary: tr('日記'), checkin: tr('打卡'), note: tr('心得'), event: tr('活動') });

const SORTS = (): [ExploreSort, string][] => [['recommend', tr('推薦')], ['latest', tr('最新')], ['popular', tr('熱門')]];

/**
 * A2 探索（v1.6）：策展｜貼文｜處方箋；搜尋列三個分頁共用、一次搜全部（W9）；
 * 「篩選」按鈕＋外面顯示生效中的條件（W6、W7）；策展多一顆月份（W8）；每個分頁最上面一張主題卡。
 */
export default function ExploreScreen() {
  const c = useTheme();
  const { session, requireAuth } = useAuth();
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab ?? 'curations');
  const [lastParam, setLastParam] = useState(params.tab);
  if (params.tab !== lastParam) {
    setLastParam(params.tab);
    if (params.tab) setTab(params.tab);
  }
  const [following, setFollowing] = useState(false);
  const [period, setPeriod] = useState(currentPeriod());
  const [monthOpen, setMonthOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [rxFilter, setRxFilter] = useState<RxFilter>('latest');
  const [rxTag, setRxTag] = useState<string | undefined>();
  const postF = usePostFilter();
  const [postView, setPostView] = useState<'posts' | 'places'>('posts');
  const [postKind, setPostKind] = useState<PostKindFilter>('all');
  const [sort, setSort] = useState<ExploreSort>('recommend');
  const [unvisitedOnly, setUnvisitedOnly] = useState(false);
  const [tag, setTag] = useState<string | undefined>();
  const { data: tags } = useSystemTags();
  const { data: months } = useExploreMonths();
  const { data: mine } = useMyStore();


  const list = useExploreList({ period: following ? null : period, sort, tag, following, unvisitedOnly });
  const isCurrent = period === currentPeriod();
  const fill = !following && isCurrent && !unvisitedOnly && !list.isPending && (list.data?.length ?? 0) < EXPLORE_MIN;
  const { data: previous } = usePreviousMonthFeed({ tag, enabled: fill });

  const { first, rest, prevStart } = useMemo(() => {
    const cur = (list.data ?? []) as FeedCard[];
    const prev = fill ? ((previous ?? []) as FeedCard[]).filter((p) => !cur.some((x) => x.curation_id === p.curation_id)) : [];
    const showFeatured = !following && sort === 'recommend' && isCurrent;
    const f = showFeatured ? (pickFeatured(cur.filter((x) => !x.visited)) ?? pickFeatured(cur) ?? prev[0]) : undefined;
    const all = [...cur, ...prev].filter((x) => x.curation_id !== f?.curation_id);
    return { first: f, rest: all, prevStart: all.findIndex((x) => prev.includes(x)) };
  }, [list.data, previous, fill, following, sort, isCurrent]);

  const loading = list.isPending && list.fetchStatus !== 'idle';
  const paused = list.fetchStatus === 'paused';
  const refetch = () => void list.refetch();

  const tagRow = tags?.find((t) => t.slug === tag);
  const tagName = tagRow ? tagLabel(tagRow) : undefined;
  const count = list.data?.length ?? 0;

  const empty = following && !session ? (
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
      {([['curations', tr('策展')], ['posts', tr('貼文')], ['rx', tr('處方箋')]] as const).map(([t, label]) => (
        <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => setTab(t)} style={[styles.tab, tab === t && { borderBottomColor: c.text }]}>
          <AppText style={{ fontSize: 15, fontWeight: tab === t ? '700' : '500', color: tab === t ? c.text : c.textSecondary }}>{label}</AppText>
        </Pressable>
      ))}
    </View>
  );

  // W6 篩選：每個分頁各自的條件；外面顯示生效中的（點 ✕ 清掉）
  const sortLabel = (x: ExploreSort) => SORTS().find(([k]) => k === x)?.[1] ?? '';
  const rxLabel = (x: RxFilter) => RX_FILTERS().find(([k]) => k === x)?.[1] ?? '';
  const active: ActiveFilter[] =
    tab === 'curations'
      ? [
          ...(following ? [{ key: 'following', label: tr('追蹤中'), clear: () => setFollowing(false) }] : []),
          ...(tag ? [{ key: 'tag', label: tagName ?? tag, clear: () => setTag(undefined) }] : []),
          ...(sort !== 'recommend' ? [{ key: 'sort', label: sortLabel(sort), clear: () => setSort('recommend') }] : []),
          ...(unvisitedOnly ? [{ key: 'unvisited', label: tr('沒逛過'), clear: () => setUnvisitedOnly(false) }] : []),
        ]
      : tab === 'posts'
        ? [
            ...(postF.filter !== 'all' ? [{ key: 'pf', label: postF.filter === 'following' ? tr('追蹤中') : tr('附近'), clear: () => postF.pick('all') }] : []),
            ...(postKind !== 'all' ? [{ key: 'pk', label: KIND_LABEL()[postKind], clear: () => setPostKind('all') }] : []),
            ...(postView === 'places' ? [{ key: 'pv', label: tr('看地點'), clear: () => setPostView('posts') }] : []),
          ]
        : [
            ...(rxFilter !== 'latest' ? [{ key: 'rxf', label: rxLabel(rxFilter), clear: () => setRxFilter('latest') }] : []),
            ...(rxTag ? [{ key: 'rxt', label: rxTagLabel(rxTag), clear: () => setRxTag(undefined) }] : []),
          ];
  const groups: FilterGroup[] =
    tab === 'curations'
      ? [
          { title: tr('看誰的'), options: [
            { key: 'all', label: tr('全部'), selected: !following, onPress: () => setFollowing(false) },
            { key: 'following', label: tr('追蹤中'), selected: following, onPress: () => requireAuth(() => setFollowing(true)) },
          ] },
          { title: tr('排序'), options: SORTS().map(([k, label]) => ({ key: k, label, selected: sort === k, onPress: () => setSort(k) })) },
          { title: tr('主題'), options: (tags ?? []).map((t) => ({ key: t.slug, label: tagLabel(t), selected: tag === t.slug, onPress: () => setTag(tag === t.slug ? undefined : t.slug) })) },
          { title: tr('其他'), options: [{ key: 'unvisited', label: tr('只看沒逛過'), selected: unvisitedOnly, onPress: () => setUnvisitedOnly(!unvisitedOnly) }] },
        ]
      : tab === 'posts'
        ? [
            { title: tr('看誰的'), options: [
              { key: 'all', label: tr('全部'), selected: postF.filter === 'all', onPress: () => postF.pick('all') },
              { key: 'following', label: tr('追蹤中'), selected: postF.filter === 'following', onPress: () => postF.pick('following') },
              ...(locationAvailable() ? [{ key: 'near', label: tr('附近'), selected: postF.filter === 'near', onPress: () => postF.pick('near') }] : []),
            ] },
            { title: tr('類型'), options: (Object.keys(KIND_LABEL()) as PostKindFilter[]).map((k) => ({ key: k, label: KIND_LABEL()[k], selected: postKind === k, onPress: () => setPostKind(k) })) },
            { title: tr('顯示'), options: [
              { key: 'posts', label: tr('貼文'), selected: postView === 'posts', onPress: () => setPostView('posts') },
              { key: 'places', label: tr('地點'), selected: postView === 'places', onPress: () => setPostView('places') },
            ] },
          ]
        : [
            { title: tr('排序'), options: RX_FILTERS().map(([k, label]) => ({ key: k, label, selected: rxFilter === k, onPress: () => setRxFilter(k) })) },
            { title: tr('標籤'), note: tr('常用的'), options: RX_TAGS.map((t) => ({ key: t, label: rxTagLabel(t), selected: rxTag === t, onPress: () => setRxTag(rxTag === t ? undefined : t) })) },
          ];
  const clearAll = () => {
    if (tab === 'curations') {
      setFollowing(false);
      setTag(undefined);
      setSort('recommend');
      setUnvisitedOnly(false);
    } else if (tab === 'posts') {
      postF.pick('all');
      setPostKind('all');
      setPostView('posts');
    }
    else {
      setRxFilter('latest');
      setRxTag(undefined);
    }
  };
  const resultLabel = tab === 'curations' ? tr('看 {n} 檔策展', { n: count }) : tab === 'posts' ? tr('看貼文') : tr('看處方箋');

  return (
    <Screen>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={styles.header}>
          <AppText variant="title">{tr('探索')}</AppText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <SearchButton />
            <NotificationBell />
          </View>
        </View>

        {segment}

        {(
          <>
            <View>
              <FilterBar
                active={active}
                onOpen={() => setFilterOpen(true)}
                lead={
                  tab === 'curations' && !following ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={tr('選月份，目前 {label}', { label: monthPillLabel(period) })}
                      onPress={() => setMonthOpen(true)}
                      style={[styles.month, { backgroundColor: c.surface, borderColor: c.border }]}>
                      <AppText variant="caption" style={{ fontWeight: '700' }}>{monthPillLabel(period)}</AppText>
                      <Feather name="chevron-down" size={16} color={c.text} />
                    </Pressable>
                  ) : undefined
                }
              />
            </View>

            {tab === 'posts' ? (
              <PostsExplore filter={postF.filter} near={postF.near} onReset={() => postF.pick('all')} view={postView} kind={postKind} />
            ) : tab === 'rx' ? (
              <RxExplore filter={rxFilter} tag={rxTag} />
            ) : loading ? (
              <ActivityIndicator style={{ marginTop: 48 }} />
            ) : paused ? (
              <EmptyState title={tr('目前沒有網路連線')} body={tr('連上網路後會自動重新載入。')} actionLabel={tr('重試')} onAction={refetch} />
            ) : list.error ? (
              <EmptyState title={tr('沒有載入成功')} body={tr('檢查網路後再試一次。')} actionLabel={tr('重試')} onAction={refetch} />
            ) : (
              <FlatList
                data={rest}
                keyExtractor={(item) => item.curation_id}
                contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, paddingBottom: 96, gap: Spacing.md, flexGrow: 1 }}
                refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={refetch} />}
                ListHeaderComponent={
                  first ? (
                    <View style={{ gap: Spacing.md }}>
                      {!following ? <TeaserStrip /> : null}
                      <FeaturedCard item={first} ownStoreId={mine?.store.id} />
                      {rest.length && prevStart !== 0 ? <AppText variant="label" style={{ marginTop: Spacing.md }}>{tr('更多 {p0} 月策展', { p0: monthOf(period) })}</AppText> : null}
                    </View>
                  ) : undefined
                }
                renderItem={({ item, index }) => (
                  <>
                    {index === prevStart ? <AppText variant="label" style={{ marginTop: Spacing.md }}>{tr('{p0} 月的策展', { p0: monthOf(previousPeriod()) })}</AppText> : null}
                    <CompactCard item={item} showMonth={following} />
                  </>
                )}
                ListEmptyComponent={first ? undefined : empty}
              />
            )}
          </>
        )}
      </SafeAreaView>
      <MonthSheet visible={monthOpen} value={period} months={months} onPick={setPeriod} onClose={() => setMonthOpen(false)} />
      <FilterSheet
        visible={filterOpen}
        title={tab === 'curations' ? tr('篩選 · 策展') : tab === 'posts' ? tr('篩選 · 貼文') : tr('篩選 · 處方箋')}
        groups={groups}
        onClear={clearAll}
        onClose={() => setFilterOpen(false)}
        resultLabel={resultLabel}
      />
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
  month: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: Radius.pill, height: 36, paddingLeft: 14, paddingRight: 10 },
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
