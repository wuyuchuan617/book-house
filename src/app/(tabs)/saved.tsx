import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { PlacesShelf } from '@/components/places-shelf';
import { FollowButton, StoreAvatar, UndoToast } from '@/components/social';
import { AppText, Card, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useFollowedStores, useSavedBooks, useToggleSave, wantSource, type FollowedStore, type SavedBook } from '@/lib/browse';
import { useMyPlaces } from '@/lib/diary';
import { useMyStore } from '@/lib/queries';
import { SwipeRow, swipeA11y } from '@/components/swipe-row';
import { WantSheet } from '@/components/want-sheet';
import { currentPeriod, monthOf } from '@/lib/period';
import { tr } from '@/lib/i18n';

type Tab = 'stores' | 'books' | 'places';

/** 書櫃：B2 想讀（預設）、B1 追蹤的書店、L3 收藏的地方（M10）；S4 空狀態 */
export default function SavedScreen() {
  const c = useTheme();
  const { session, requireAuth } = useAuth();
  const [tab, setTab] = useState<Tab>('books');
  const stores = useFollowedStores();
  const books = useSavedBooks();
  const places = useMyPlaces('want');
  const toggleSave = useToggleSave();
  const [undo, setUndo] = useState<SavedBook | null>(null);
  const [openWant, setOpenWant] = useState<SavedBook | null>(null);
  const { data: mine } = useMyStore();
  const hideToast = useCallback(() => setUndo(null), []);

  if (!session) {
    return (
      <Screen>
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <AppText variant="title" style={styles.title}>{tr('書櫃')}</AppText>
          <EmptyState title={tr('登入後就能使用書櫃')} body={tr('把想讀的書收進書櫃，追蹤喜歡的店主。')} actionLabel={tr('登入')} onAction={() => requireAuth(() => {})} />
        </SafeAreaView>
      </Screen>
    );
  }

  const unsave = (b: SavedBook) => {
    toggleSave.mutate({ bookId: b.book_id, save: false });
    setUndo(b);
  };
  const restore = () => {
    if (undo) toggleSave.mutate({ bookId: undo.book_id, save: true, curationId: undo.from_curation_id, bookstoreId: undo.from_bookstore_id, note: undo.note, sourceText: undo.source_text });
    setUndo(null);
  };

  return (
    <Screen>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <AppText variant="title" style={styles.title}>{tr('書櫃')}</AppText>
        <View style={[styles.segment, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
          {(['books', 'stores', 'places'] as Tab[]).map((t) => {
            const selected = tab === t;
            const count = t === 'stores' ? stores.data?.length : t === 'places' ? places.data?.length : books.data?.length;
            return (
              <Pressable
                key={t}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setTab(t)}
                style={[styles.segmentItem, selected && { backgroundColor: c.surface }]}>
                <AppText variant="caption" style={{ fontWeight: '700', color: selected ? c.text : c.textSecondary }}>
                  {`${t === 'stores' ? tr('追蹤的書店') : t === 'places' ? tr('地方') : tr('想讀')} · ${count ?? 0}`}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {tab === 'places' ? (
          <PlacesShelf />
        ) : tab === 'stores' ? (
          stores.isLoading ? (
            <ActivityIndicator style={{ marginTop: 48 }} />
          ) : (
            <FlatList
              data={stores.data}
              keyExtractor={(s) => s.id}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={stores.isRefetching} onRefresh={() => void stores.refetch()} />}
              ListEmptyComponent={
                <EmptyState title={tr('還沒有追蹤的書店')} body={tr('追蹤喜歡的店主，\n每月新策展上架時第一個知道。')} actionLabel={tr('去探索書店')} onAction={() => router.navigate('/')} />
              }
              renderItem={({ item }) => <StoreRow store={item} />}
            />
          )
        ) : books.isLoading ? (
          <ActivityIndicator style={{ marginTop: 48 }} />
        ) : books.error ? (
          <EmptyState title={tr('想讀清單沒有載入成功')} body={tr('你的想讀都還在，只是這次沒讀到。檢查網路後再試一次。')} actionLabel={tr('重試')} onAction={() => void books.refetch()} />
        ) : (
          <FlatList
            data={books.data}
            keyExtractor={(b) => b.book_id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={books.isRefetching} onRefresh={() => void books.refetch()} />}
            ListHeaderComponent={books.data?.length ? <AppText variant="caption" muted>{tr('{length} 本', { length: books.data.length })}</AppText> : undefined}
            ListEmptyComponent={
              <EmptyState title={tr('還沒有想讀的書')} body={tr('在書店頁按書旁邊的書籤，\n或在店主閱讀按「＋」加入想讀。')} actionLabel={tr('去探索書店')} onAction={() => router.navigate('/')} />
            }
            renderItem={({ item }) => <BookRow item={item} onOpen={() => setOpenWant(item)} onUnsave={() => unsave(item)} />}
          />
        )}
        <UndoToast message={undo ? tr('已從想讀移除「{title}」', { title: undo.books.title }) : null} onUndo={restore} onHide={hideToast} />
        <WantSheet item={openWant} hasStore={!!mine} onClose={() => setOpenWant(null)} />
      </SafeAreaView>
    </Screen>
  );
}

function StoreRow({ store }: { store: FollowedStore }) {
  const c = useTheme();
  const isNew = store.latest?.period === currentPeriod();
  return (
    <Card style={{ gap: Spacing.sm }}>
      <View style={styles.row}>
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: store.slug } })} style={[styles.row, { flex: 1 }]}>
          <StoreAvatar name={store.name} color={store.color} size={44} />
          <View style={{ flex: 1 }}>
            <AppText variant="label" style={{ fontSize: 16 }}>{store.name}</AppText>
            <AppText variant="caption" muted>{tr('{owner_name} · {follower_count} 人追蹤', { owner_name: store.owner_name, follower_count: store.follower_count })}</AppText>
          </View>
        </Pressable>
        <FollowButton bookstoreId={store.id} storeName={store.name} />
      </View>
      {store.latest ? (
        <View style={[styles.latest, { backgroundColor: isNew ? c.successSurface : c.background }]}>
          {isNew ? (
            <>
              <AppText variant="caption" style={{ color: c.success, fontWeight: '700' }}>{tr('{p0} 月新策展', { p0: monthOf(store.latest.period) })}</AppText>
              <AppText variant="caption">{tr('「{title}」已上架', { title: store.latest.title })}</AppText>
            </>
          ) : (
            <AppText variant="caption" muted>{tr('最近策展：{title} · {book_count} 本書', { title: store.latest.title, book_count: store.latest.book_count })}</AppText>
          )}
        </View>
      ) : (
        <AppText variant="caption" muted>{tr('還沒有發布策展')}</AppText>
      )}
    </Card>
  );
}

function BookRow({ item, onOpen, onUnsave }: { item: SavedBook; onOpen: () => void; onUnsave: () => void }) {
  const c = useTheme();
  const from = wantSource(item);
  const actions = [
    { label: tr('編輯'), icon: 'edit-2' as const, onPress: onOpen },
    { label: tr('移除'), icon: 'trash-2' as const, destructive: true, onPress: onUnsave },
  ];
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <SwipeRow actions={actions}>
      <View style={[styles.row, { padding: Spacing.lg }]}>
      <Pressable accessibilityRole="button" accessibilityHint={tr('編輯為什麼想讀、在哪看到')} {...swipeA11y(actions)} onPress={onOpen} style={[styles.row, { flex: 1 }]}>
        <BookCover title={item.books.title} url={item.books.cover_url} color={item.bookstores?.color ?? 'moss'} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label">{item.books.title}</AppText>
          <AppText variant="caption" muted>{item.books.authors.join(tr('、'))}</AppText>
          {from ? <AppText variant="caption" style={{ color: c.textTertiary }} numberOfLines={1}>{tr('在哪看到：{from}', { from })}</AppText> : null}
          {item.note ? <AppText variant="caption" numberOfLines={2}>{tr('「{note}」', { note: item.note })}</AppText> : null}
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={tr('從想讀移除「{title}」', { title: item.books.title })} onPress={onUnsave} style={styles.unsave}>
        <Ionicons name="bookmark" size={20} color={c.primary} />
      </Pressable>
      </View>
      </SwipeRow>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg },
  segment: { flexDirection: 'row', marginHorizontal: Spacing.xl, marginTop: Spacing.md, borderRadius: Radius.md, padding: 3 },
  segmentItem: { flex: 1, minHeight: MinTouch - 4, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  list: { padding: Spacing.xl, gap: Spacing.md, flexGrow: 1, paddingBottom: 96 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  latest: { borderRadius: Radius.md, padding: Spacing.md, gap: 2 },
  unsave: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center' },
});
