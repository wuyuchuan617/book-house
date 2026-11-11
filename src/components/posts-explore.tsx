import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { BookLine, DiaryPhotos } from '@/components/diary';
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
 * 最上面一張主題卡＝最新一則有照片的貼文；右上切「貼文／地點」：地點就是原本的「書的地方」（E2）。
 */
export function PostsExplore({ filter, near, onReset }: { filter: PostFilter; near: Coords | null; onReset: () => void }) {
  const c = useTheme();
  const { requireAuth } = useAuth();
  const [view, setView] = useState<'posts' | 'places'>('posts');
  const [menuFor, setMenuFor] = useState<PublicPost | null>(null);
  const [reportFor, setReportFor] = useState<PublicPost | null>(null);
  const list = useExplorePosts(filter, near);
  const report = useReportCheckin();
  const data = list.data ?? [];
  const themeIndex = filter === 'all' ? data.findIndex((p) => p.photo_paths.length > 0) : -1;
  const ordered = themeIndex > 0 ? [data[themeIndex], ...data.slice(0, themeIndex), ...data.slice(themeIndex + 1)] : data;

  const toggle = (
    <View style={[styles.toggle, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
      {(['posts', 'places'] as const).map((v) => (
        <Pressable key={v} accessibilityRole="tab" accessibilityState={{ selected: view === v }} onPress={() => setView(v)} style={[styles.toggleItem, view === v && { backgroundColor: c.surface }]}>
          {v === 'places' ? <Feather name="map-pin" size={12} color={view === v ? c.text : c.textSecondary} /> : null}
          <AppText variant="caption" style={{ fontWeight: '700', color: view === v ? c.text : c.textSecondary }}>{v === 'posts' ? tr('貼文') : tr('地點')}</AppText>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.bar}>
        <AppText variant="caption" muted style={{ flex: 1 }}>{view === 'posts' ? tr('公開的日記、打卡和心得') : tr('大家打卡過的書店、圖書館')}</AppText>
        {toggle}
      </View>

      {view === 'places' ? (
        <PlacesExplore />
      ) : list.isPending ? (
        <ActivityIndicator style={{ marginTop: 48 }} />
      ) : list.error ? (
        <EmptyState title={tr('沒有載入成功')} body={tr('檢查網路後再試一次。')} actionLabel={tr('重試')} onAction={() => void list.refetch()} />
      ) : (
        <FlatList
          data={ordered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md, flexGrow: 1, paddingBottom: 96 }}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
          ListEmptyComponent={
            filter === 'following' ? (
              <EmptyState title={tr('追蹤的書店還沒有公開貼文')} body={tr('追蹤更多書店，或看看全部的貼文。')} actionLabel={tr('看全部')} onAction={onReset} />
            ) : filter === 'near' ? (
              <EmptyState title={tr('附近還沒有公開貼文')} body={tr('在有書的地方打卡、設成公開，就會出現在這裡。')} actionLabel={tr('看全部')} onAction={onReset} />
            ) : (
              <EmptyState title={tr('還沒有公開貼文')} body={tr('寫日記時選「公開」，就會出現在這裡。')} />
            )
          }
          renderItem={({ item, index }) => <PostCard post={item} theme={index === 0 && themeIndex >= 0} onMore={item.is_mine || item.source === 'note' ? undefined : () => requireAuth(() => setMenuFor(item))} />}
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

export function PostCard({ post, onMore, theme }: { post: PublicPost; onMore?: () => void; theme?: boolean }) {
  const c = useTheme();
  const { requireAuth } = useAuth();
  const color = (post.author_store_color ?? 'moss') as StoreColor;
  const { data: saveIds } = useSaveIds();
  const toggleSave = useToggleSave();
  const savePlace = useSavePlace();
  const bookSaved = !!post.book_id && !!saveIds?.has(post.book_id);

  const wantPlace = () =>
    requireAuth(() =>
      savePlace.mutate(
        { placeId: post.place_id!, save: true, from: 'post' },
        { onSuccess: () => Alert.alert(tr('已存成想去'), tr('在書櫃 › 地方・想去可以寫原因。')), onError: (e) => Alert.alert(tr('沒有成功'), diaryError(e.message)) },
      ),
    );
  const wantBook = () => requireAuth(() => toggleSave.mutate({ bookId: post.book_id!, save: !bookSaved, sourceText: bookSaved ? null : tr('貼文：{name}', { name: post.author_name }).slice(0, 60) }));

  return (
    <Card style={[{ gap: Spacing.sm }, theme && { borderWidth: 1.5, borderColor: c.primary }]}>
      {theme ? <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('最新的照片貼文')}</AppText> : null}
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
        {onMore ? (
          <Pressable accessibilityRole="button" accessibilityLabel={tr('更多操作')} hitSlop={10} onPress={onMore}>
            <Feather name="more-horizontal" size={18} color={c.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {post.place_id && post.place_name ? (
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/place/[id]', params: { id: post.place_id! } })} style={[styles.place, { backgroundColor: c.surfaceMuted }]}>
          <Feather name="map-pin" size={12} color={c.primary} />
          <AppText variant="caption" style={{ fontWeight: '700', color: c.primary }} numberOfLines={1}>{post.place_name}</AppText>
          {post.distance_m != null ? <AppText variant="caption" muted>{post.distance_m < 1000 ? tr('{n} 公尺', { n: post.distance_m }) : tr('{n} 公里', { n: (post.distance_m / 1000).toFixed(1) })}</AppText> : null}
        </Pressable>
      ) : null}
      {post.source === 'note' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          {post.note_kind ? <KindChip kind={post.note_kind} /> : null}
          {post.title ? <AppText variant="label" style={{ flex: 1 }} numberOfLines={1}>{post.title}</AppText> : null}
        </View>
      ) : null}
      {post.body ? <AppText style={{ lineHeight: 23 }}>{post.source === 'note' && post.note_kind === 'quote' ? tr('「{body}」', { body: post.body }) : post.body}</AppText> : null}
      {post.source === 'note' ? <NotePhotos paths={post.photo_paths} /> : <DiaryPhotos paths={post.photo_paths} />}
      {post.book_id && post.book_title ? (
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/book/[id]', params: { id: post.book_id! } })} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <View style={{ flex: 1 }}>
            <BookLine book={{ id: post.book_id, title: post.book_title, cover_url: post.book_cover_url }} color={color} />
          </View>
          {post.page_ref ? <AppText variant="caption" muted>{post.page_ref}</AppText> : null}
        </Pressable>
      ) : null}
      {!post.is_mine && (post.place_id || post.book_id) ? (
        <View style={{ flexDirection: 'row', gap: Spacing.lg }}>
          {post.place_id ? (
            <Pressable accessibilityRole="button" onPress={wantPlace} hitSlop={8} style={styles.action}>
              <Feather name="bookmark" size={14} color={c.textSecondary} />
              <AppText variant="caption" muted>{tr('我也想去')}</AppText>
            </Pressable>
          ) : null}
          {post.book_id ? (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: bookSaved }} onPress={wantBook} hitSlop={8} style={styles.action}>
              <Feather name="bookmark" size={14} color={bookSaved ? c.primary : c.textSecondary} />
              <AppText variant="caption" style={{ color: bookSaved ? c.primary : c.textSecondary, fontWeight: bookSaved ? '700' : '400' }}>{bookSaved ? tr('已在想讀') : tr('想讀')}</AppText>
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
});
