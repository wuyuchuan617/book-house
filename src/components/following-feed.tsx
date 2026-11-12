import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { FollowButton, StoreAvatar } from '@/components/social';
import { AppText, Card, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useFollowIds } from '@/lib/browse';
import { useFollowingFeed, useMarkFeedSeen, useSuggestStores, type FeedGroup, type FeedItem } from '@/lib/feed';
import { tr } from '@/lib/i18n';
import { taipeiDate, taipeiToday, timeAgo } from '@/lib/period';

type Icon = React.ComponentProps<typeof Feather>['name'];

const openStore = (slug: string) => router.push({ pathname: '/store/[slug]', params: { slug } });
const month = (period?: string) => (period ? Number(period.slice(5, 7)) : 0);

/** 一行動態：圖示＋一句話；點了到那個內容 */
function line(it: FeedItem, slug: string): { icon: Icon; color: string; text: string; go: () => void } {
  const d = it.data;
  switch (it.kind) {
    case 'curation':
      return { icon: 'grid', color: '#8B4F37', text: tr('上架了 {m} 月策展《{title}》 · {n} 本', { m: month(d.period), title: d.title ?? '', n: d.book_count ?? 0 }), go: () => openStore(slug) };
    case 'teaser':
      return { icon: 'clock', color: '#8B4F37', text: tr('預告 {m} 月策展《{title}》', { m: month(d.period), title: d.title ?? tr('（未命名策展）') }), go: () => openStore(slug) };
    case 'post':
      return d.place
        ? { icon: 'map-pin', color: '#5A4B8A', text: d.body ? tr('在{place}打卡：「{body}」', { place: d.place, body: d.body }) : tr('在{place}打卡', { place: d.place }), go: () => router.push({ pathname: '/store/[slug]', params: { slug, tab: 'journal' } }) }
        : { icon: 'edit-3', color: '#5A4B8A', text: tr('寫了手記：「{body}」', { body: d.body ?? '' }), go: () => router.push({ pathname: '/store/[slug]', params: { slug, tab: 'journal' } }) };
    case 'reading_started':
      return { icon: 'play', color: '#2F6B3A', text: tr('開始讀《{title}》', { title: d.book?.title ?? '' }), go: () => d.book && router.push({ pathname: '/book/[id]', params: { id: d.book.id } }) };
    case 'reading_finished':
      return { icon: 'check-circle', color: '#2F6B3A', text: tr('讀完《{title}》', { title: d.book?.title ?? '' }), go: () => d.book && router.push({ pathname: '/book/[id]', params: { id: d.book.id } }) };
    case 'trip':
      return { icon: 'compass', color: '#2E5A87', text: tr('整理了書旅「{title}」 · {city}', { title: d.title ?? '', city: d.city ?? '' }), go: () => router.push({ pathname: '/trip/[id]', params: { id: it.ref } }) };
    case 'rx':
      return { icon: 'message-circle', color: '#5A4B8A', text: tr('發起處方箋「{title}」', { title: d.title ?? '' }), go: () => router.push({ pathname: '/rx/[id]', params: { id: it.ref } }) };
    case 'rx_reply':
      return { icon: 'message-circle', color: '#5A4B8A', text: tr('開了《{book}》給「{title}」', { book: d.book?.title ?? '', title: d.title ?? '' }), go: () => router.push({ pathname: '/rx/[id]', params: { id: it.ref } }) };
    case 'event_share':
    default:
      return { icon: 'calendar', color: '#9A4A12', text: tr('分享了活動「{title}」', { title: d.title ?? '' }), go: () => router.push({ pathname: '/event/[id]', params: { id: it.ref } }) };
  }
}

function GroupCard({ g, isNew }: { g: FeedGroup; isNew: boolean }) {
  const c = useTheme();
  const when = g.day === taipeiToday() ? timeAgo(g.latest_at) : taipeiDate(`${g.day}T04:00:00Z`).md;
  return (
    <Card style={{ gap: 2, paddingBottom: Spacing.sm }}>
      <Pressable accessibilityRole="link" onPress={() => openStore(g.store.slug)} style={styles.head}>
        <StoreAvatar name={g.store.name} color={g.store.color} size={30} path={g.store.avatar_path} />
        <AppText variant="label" style={{ flex: 1 }} numberOfLines={1}>{g.store.name}</AppText>
        {isNew ? <View style={[styles.dot, { backgroundColor: c.primary }]} accessibilityLabel={tr('新的')} /> : null}
        <AppText variant="caption" muted>{when}</AppText>
      </Pressable>
      {g.items.map((it, i) => {
        const l = line(it, g.store.slug);
        return (
          <Pressable key={`${it.kind}-${it.ref}-${i}`} accessibilityRole="link" onPress={l.go} style={[styles.row, { borderTopColor: c.divider }]}>
            <Feather name={l.icon} size={15} color={l.color} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 6 }}>
              <AppText style={{ fontSize: 14, lineHeight: 21 }} numberOfLines={2}>{l.text}</AppText>
              {it.kind === 'curation' && it.data.covers?.length ? (
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {it.data.covers.map((b, j) => <BookCover key={`${b.title}-${j}`} title={b.title} url={b.cover_url} color={g.store.color} size="sm" />)}
                </View>
              ) : null}
            </View>
            <Feather name="chevron-right" size={15} color={c.textTertiary} style={{ marginTop: 3 }} />
          </Pressable>
        );
      })}
      {g.more ? (
        <Pressable accessibilityRole="link" onPress={() => openStore(g.store.slug)} style={[styles.row, { borderTopColor: c.divider }]}>
          <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('還有 {n} 則 ›', { n: g.more })}</AppText>
        </Pressable>
      ) : null}
    </Card>
  );
}

/** 還沒追蹤：推薦幾間書店 */
function Suggest() {
  const c = useTheme();
  const { data } = useSuggestStores(true);
  return (
    <View style={{ gap: Spacing.md, paddingTop: Spacing.xl }}>
      <View style={{ alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg }}>
        <View style={[styles.emptyIcon, { backgroundColor: c.surfaceMuted }]}>
          <Feather name="bookmark" size={26} color={c.primary} />
        </View>
        <AppText variant="heading">{tr('追蹤喜歡的書店')}</AppText>
        <AppText muted style={{ textAlign: 'center', lineHeight: 22 }}>{tr('他們上架策展、寫手記、開始讀新書、整理書旅，都會整理在這裡。')}</AppText>
      </View>
      {data?.length ? (
        <View style={{ gap: Spacing.sm }}>
          <AppText variant="caption" muted style={{ fontWeight: '700', marginTop: Spacing.md }}>{tr('可以先追蹤這幾間')}</AppText>
          {data.map((s) => (
            <Card key={s.id} style={styles.suggest}>
              <Pressable accessibilityRole="link" onPress={() => openStore(s.slug)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <StoreAvatar name={s.name} color={s.color} size={34} path={s.avatar_path} />
                <View style={{ flex: 1 }}>
                  <AppText variant="label" numberOfLines={1}>{s.name}</AppText>
                  <AppText variant="caption" muted numberOfLines={1}>
                    {[tr('{n} 人追蹤', { n: s.follower_count }), s.reason === 'curation' ? tr('本月有策展') : s.reason === 'post' ? tr('最近寫了手記') : null].filter(Boolean).join(' · ')}
                  </AppText>
                </View>
              </Pressable>
              <FollowButton bookstoreId={s.id} storeName={s.name} />
            </Card>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** 探索 › 追蹤：書店依最新動作排；「上次看到這裡」分隔線；打開後記成看過 */
export function FollowingFeed() {
  const c = useTheme();
  const { session, requireAuth } = useAuth();
  const feed = useFollowingFeed();
  const follows = useFollowIds();
  const markSeen = useMarkFeedSeen();
  // 打開時的「上次看到」：記下來，標成看過之後分隔線也不會跳走
  const [seenSnap, setSeenSnap] = useState<string | null | undefined>(undefined);
  if (feed.data && seenSnap === undefined) setSeenSnap(feed.data.seen_at);
  const loaded = !!feed.data;
  const mutate = markSeen.mutate;
  useEffect(() => {
    if (loaded) mutate();
  }, [loaded, mutate]);

  if (!session) return <EmptyState title={tr('登入後看追蹤的書店')} body={tr('追蹤喜歡的店主，他們的新動態會整理在這裡。')} actionLabel={tr('登入')} onAction={() => requireAuth(() => {})} />;
  if (feed.isPending || follows.isPending) return <ActivityIndicator style={{ marginTop: 48 }} />;
  const groups = feed.data?.groups ?? [];
  const seen = seenSnap ?? null;
  const firstOld = seen ? groups.findIndex((g) => g.latest_at <= seen) : -1;

  return (
    <FlatList
      data={groups}
      keyExtractor={(g) => `${g.store.id}-${g.day}`}
      contentContainerStyle={{ padding: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.md, flexGrow: 1, paddingBottom: 96 }}
      refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} />}
      ListEmptyComponent={
        follows.data?.size ? (
          <EmptyState title={tr('最近沒有新動態')} body={tr('追蹤的書店有新的策展、手記、書旅時，會出現在這裡。')} actionLabel={tr('看本月策展')} onAction={() => router.setParams({ tab: 'curations' })} />
        ) : (
          <Suggest />
        )
      }
      renderItem={({ item, index }) => (
        <>
          {index === firstOld && index > 0 ? (
            <View style={styles.divider} accessibilityRole="text">
              <View style={[styles.rule, { backgroundColor: c.border }]} />
              <AppText variant="caption" muted>{tr('上次看到這裡')}</AppText>
              <View style={[styles.rule, { backgroundColor: c.border }]} />
            </View>
          ) : null}
          <GroupCard g={item} isNew={!seen || item.latest_at > seen} />
        </>
      )}
    />
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 40, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, minHeight: 44 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  emptyIcon: { width: 64, height: 64, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center' },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
});
