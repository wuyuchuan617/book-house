import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { DiaryPhotos } from '@/components/diary';
import { KindChip, NotePhotos } from '@/components/note-card';
import { PlacesExplore } from '@/components/places-explore';
import { ActionSheet } from '@/components/sheet';
import { StoreAvatar } from '@/components/social';
import { AppText, Card, EmptyState } from '@/components/ui';
import { Radius, Spacing, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useSaveIds, useToggleSave } from '@/lib/browse';
import { diaryError, useExplorePosts, useReportCheckin, useSavePlace, type PostFilter, type PublicPost } from '@/lib/diary';
import { tr } from '@/lib/i18n';
import { approximateLocation, type Coords } from '@/lib/location';
import { timeAgo } from '@/lib/period';
import { REPORT_REASONS } from '@/lib/safety';
import { EventCard, EventsExplore } from '@/components/event-card';
import { useExploreEvents, type BookEvent } from '@/lib/events';

/** 探索 › 貼文的「看誰的」：全部／追蹤中／附近（附近要先拿到大概位置） */
export function usePostFilter() {
  const { session, requireAuth } = useAuth();
  const [filter, setFilter] = useState<PostFilter>('all');
  const [near, setNear] = useState<Coords | null>(null);
  const pick = (f: PostFilter) => {
    if (f === 'following' && !session) return requireAuth(() => setFilter('following'));
    if (f === 'near' && !near) {
      void approximateLocation({ ask: true }).then((p) => {
        if (p) {
          setNear(p);
          setFilter('near');
        } else Alert.alert(tr('拿不到位置'), tr('可以到手機設定允許書棲取得大概位置。'));
      });
      return;
    }
    setFilter(f);
  };
  return { filter, near, pick, session };
}

/**
 * E1 探索 › 貼文（v1.6）：公開的日記貼文＋書公開的心得；看誰的（全部／追蹤中／附近）由上面的「篩選」決定。
 * v1.7.1 Z4：不再有「最新的照片貼文」主題卡（看起來像被選取）。右上切「貼文／地點」：地點就是原本的「書的地方」（E2）。
 */
export function PostsExplore({ filter, near, onReset, view, kind }: { filter: PostFilter; near: Coords | null; onReset: () => void; view: 'posts' | 'places'; kind: PostKindFilter }) {
  const { requireAuth } = useAuth();
  const [menuFor, setMenuFor] = useState<PublicPost | null>(null);
  const [reportFor, setReportFor] = useState<PublicPost | null>(null);
  const list = useExplorePosts(filter, near);
  // v1.8 AI2：「全部」裡也有活動，一個活動一張卡，用最新一則分享的時間跟貼文一起排
  const events = useExploreEvents(filter, near, kind === 'all' && view === 'posts');
  const report = useReportCheckin();
  const data = (list.data ?? []).filter((p) =>
    kind === 'all' ? true : kind === 'note' ? p.source === 'note' : kind === 'checkin' ? p.source !== 'note' && (p.kind === 'checkin' || !!p.place_id) : p.source !== 'note' && p.kind !== 'checkin' && !p.place_id,
  );

  const rows: Row[] = [
    ...data.map((p) => ({ type: 'post' as const, p, at: p.created_at })),
    ...(kind === 'all' ? (events.data ?? []).map((e) => ({ type: 'event' as const, e, at: e.latest_at ?? e.starts_at })) : []),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <View style={{ flex: 1 }}>
      {view === 'places' ? (
        <PlacesExplore />
      ) : kind === 'event' ? (
        <EventsExplore filter={filter} near={near} />
      ) : list.isPending ? (
        <ActivityIndicator style={{ marginTop: 48 }} />
      ) : list.error ? (
        <EmptyState title={tr('沒有載入成功')} body={tr('檢查網路後再試一次。')} actionLabel={tr('重試')} onAction={() => void list.refetch()} />
      ) : (
        <FlatList<Row>
          data={rows}
          keyExtractor={(r) => (r.type === 'event' ? `e-${r.e.id}` : r.p.id)}
          contentContainerStyle={{ padding: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md, flexGrow: 1, paddingBottom: 96 }}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
          ListEmptyComponent={
            filter === 'following' ? (
              <EmptyState title={tr('追蹤的書店還沒有公開的手記')} body={tr('追蹤更多書店，或看看全部的手記。')} actionLabel={tr('看全部')} onAction={onReset} />
            ) : filter === 'near' ? (
              <EmptyState title={tr('附近還沒有公開的手記')} body={tr('在有書的地方打卡、設成公開，就會出現在這裡。')} actionLabel={tr('看全部')} onAction={onReset} />
            ) : (
              <EmptyState title={tr('還沒有公開的手記')} body={tr('寫日記時選「公開」，就會出現在這裡。')} />
            )
          }
          renderItem={({ item }) =>
            item.type === 'event' ? (
              <EventCard e={item.e} />
            ) : (
              <PostCard post={item.p} onMore={item.p.is_mine || item.p.source === 'note' ? undefined : () => requireAuth(() => setMenuFor(item.p))} />
            )
          }
        />
      )}

      <ActionSheet
        visible={!!menuFor}
        onClose={() => setMenuFor(null)}
        actions={[
          {
            label: tr('檢舉這則貼文'),
            icon: 'flag' as const,
            destructive: true,
            onPress: () => {
              const target = menuFor;
              setMenuFor(null);
              setTimeout(() => setReportFor(target), 400);
            },
          },
        ]}
      />
      <ActionSheet
        visible={!!reportFor}
        title={tr('檢舉原因')}
        onClose={() => setReportFor(null)}
        actions={REPORT_REASONS.map((r) => ({
          label: r.label,
          sub: r.sub,
          onPress: () => {
            const target = reportFor;
            setReportFor(null);
            if (!target) return;
            report.mutate(
              { entryId: target.id, reason: r.value },
              {
                onSuccess: () => Alert.alert(tr('已送出檢舉'), tr('謝謝你，我們會盡快處理。')),
                onError: (e) => Alert.alert(tr('沒有送出'), diaryError(e.message)),
              },
            );
          },
        }))}
      />
    </View>
  );
}

/** 類型標籤放右上（日記／打卡／心得／摘句／想法） */
function PostKind({ post }: { post: PublicPost }) {
  if (post.source === 'note' && post.note_kind) return <KindChip kind={post.note_kind} />;
  const checkin = post.kind === 'checkin' || !!post.place_id;
  const fg = checkin ? '#5A4B8A' : '#6B635A';
  return (
    <View style={[styles.kind, { backgroundColor: checkin ? '#ECE8F4' : '#EFE8DE' }]}>
      <AppText variant="caption" style={{ fontSize: 11, fontWeight: '700', color: fg }}>{checkin ? tr('打卡') : tr('日記')}</AppText>
    </View>
  );
}

type Row = { type: 'post'; p: PublicPost; at: string } | { type: 'event'; e: BookEvent; at: string };

export type PostKindFilter = 'all' | 'diary' | 'checkin' | 'note' | 'event';

export function PostCard({ post, onMore }: { post: PublicPost; onMore?: () => void }) {
  const c = useTheme();
  const { requireAuth } = useAuth();
  const color = (post.author_store_color ?? 'moss') as StoreColor;
  const { data: saveIds } = useSaveIds();
  const toggleSave = useToggleSave();
  const savePlace = useSavePlace();
  const bookSaved = !!post.book_id && !!saveIds?.has(post.book_id);
  const [placeSaved, setPlaceSaved] = useState(false);
  const showWant = !post.is_mine && !!(post.book_id || post.place_id);

  const wantPlace = () =>
    requireAuth(() =>
      savePlace.mutate(
        { placeId: post.place_id!, save: true, from: 'post' },
        { onSuccess: () => { setPlaceSaved(true); Alert.alert(tr('已存成想去'), tr('在書櫃 › 地方・想去可以寫原因。')); }, onError: (e) => Alert.alert(tr('沒有成功'), diaryError(e.message)) },
      ),
    );
  const wantBook = () => requireAuth(() => toggleSave.mutate({ bookId: post.book_id!, save: !bookSaved, sourceText: bookSaved ? null : tr('貼文：{name}', { name: post.author_name }).slice(0, 60) }));

  return (
    <Card style={{ gap: Spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        <Pressable
          accessibilityRole={post.author_store_slug ? 'link' : undefined}
          disabled={!post.author_store_slug}
          onPress={() => post.author_store_slug && router.push({ pathname: '/store/[slug]', params: { slug: post.author_store_slug } })}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <StoreAvatar name={post.author_name} color={color} size={30} path={post.author_avatar_path} />
          <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>{post.author_name}</AppText>
          <AppText variant="caption" style={{ color: c.textTertiary }}>{`· ${timeAgo(post.created_at)}`}</AppText>
        </Pressable>
        <PostKind post={post} />
      </View>
      {post.source === 'note' && post.title ? <AppText variant="label">{post.title}</AppText> : null}
      {post.body ? <AppText style={{ lineHeight: 23, fontSize: 15 }}>{post.source === 'note' && post.note_kind === 'quote' ? tr('「{body}」', { body: post.body }) : post.body}</AppText> : null}
      {post.source === 'note' ? <NotePhotos paths={post.photo_paths} /> : <DiaryPhotos paths={post.photo_paths} />}
      {/* Y10／Z4：《書名》完整顯示、頁數、地點；最下面一排：左邊想讀／想去，右邊 ⋯（只有圖示加字，不加框） */}
      <View style={styles.meta}>
        {post.book_id && post.book_title ? (
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/book/[id]', params: { id: post.book_id! } })} hitSlop={6} style={{ flexShrink: 1 }}>
            <AppText variant="caption" style={{ color: c.text, fontWeight: '600' }}>{tr('《{title}》', { title: post.book_title })}</AppText>
          </Pressable>
        ) : null}
        {post.page_ref ? <AppText variant="caption" muted>{post.page_ref}</AppText> : null}
        {post.place_id && post.place_name ? (
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/place/[id]', params: { id: post.place_id! } })} hitSlop={6} style={[styles.action, { flexShrink: 1 }]}>
            <Feather name="map-pin" size={12} color="#2F5D6B" />
            <AppText variant="caption" numberOfLines={1} style={{ color: '#2F5D6B', fontWeight: '600', flexShrink: 1 }}>{post.place_name}</AppText>
            {post.distance_m != null ? <AppText variant="caption" muted>{post.distance_m < 1000 ? tr('{n} 公尺', { n: post.distance_m }) : tr('{n} 公里', { n: (post.distance_m / 1000).toFixed(1) })}</AppText> : null}
          </Pressable>
        ) : null}
      </View>
      {showWant || onMore ? (
        <View style={styles.foot}>
          {!post.is_mine && post.book_id ? (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: bookSaved }} onPress={wantBook} style={styles.footBtn}>
              <Feather name="bookmark" size={16} color={bookSaved ? c.primary : c.textSecondary} />
              <AppText variant="caption" style={{ color: bookSaved ? c.primary : c.textSecondary, fontWeight: bookSaved ? '700' : '500' }}>{bookSaved ? tr('已想讀') : tr('想讀')}</AppText>
            </Pressable>
          ) : !post.is_mine && post.place_id ? (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: placeSaved }} onPress={wantPlace} style={styles.footBtn}>
              <Feather name="bookmark" size={16} color={placeSaved ? c.primary : c.textSecondary} />
              <AppText variant="caption" style={{ color: placeSaved ? c.primary : c.textSecondary, fontWeight: placeSaved ? '700' : '500' }}>{placeSaved ? tr('已想去') : tr('想去')}</AppText>
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }} />
          {onMore ? (
            <Pressable accessibilityRole="button" accessibilityLabel={tr('更多操作')} onPress={onMore} style={[styles.footBtn, { justifyContent: 'center', minWidth: 44 }]}>
              <Feather name="more-horizontal" size={18} color={c.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing.sm, gap: Spacing.sm },
  toggle: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 2 },
  toggleItem: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill, maxWidth: '100%' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flexWrap: 'wrap' },
  foot: { flexDirection: 'row', alignItems: 'center', marginTop: -Spacing.xs, marginBottom: -Spacing.sm },
  footBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 },
  kind: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.sm },
});
