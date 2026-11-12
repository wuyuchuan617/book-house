import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotificationBell, SearchButton } from '@/components/icon-button';
import { BookCover } from '@/components/book-cover';
import { PlacesShelf } from '@/components/places-shelf';
import { TbrShelf } from '@/components/tbr-shelf';
import { UndoToast } from '@/components/social';
import { AppText, Card, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useSavedBooks, useStartReading, useToggleSave, wantSource, type SavedBook } from '@/lib/browse';
import { userMessage } from '@/lib/errors';
import { useMyPurchases } from '@/lib/purchases';
import { useMyPlaces } from '@/lib/diary';
import { ActionSheet } from '@/components/sheet';
import { MoreButton, SwipeRow, swipeA11y } from '@/components/swipe-row';
import { LinkLine } from '@/components/link-line';
import { bookTitle, tr } from '@/lib/i18n';
import { AboutIntro, AboutLink } from '@/components/about';

type Tab = 'books' | 'tbr' | 'places';

/** 書櫃（v1.6）：只留想讀（預設）、地點；追蹤的書店移到我的書店的「追蹤中」，處方箋移到我的書店的「處方箋」分頁 */
export default function SavedScreen() {
  const c = useTheme();
  const { session, requireAuth } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const fromParam = (t?: string): Tab => (t === 'places' ? 'places' : t === 'tbr' ? 'tbr' : 'books');
  const purchases = useMyPurchases();
  const [tab, setTab] = useState<Tab>(fromParam(params.tab));
  const [lastParam, setLastParam] = useState(params.tab);
  if (params.tab !== lastParam) {
    setLastParam(params.tab);
    if (params.tab) setTab(fromParam(params.tab));
  }
  const books = useSavedBooks();
  const places = useMyPlaces('want');
  const toggleSave = useToggleSave();
  const [undo, setUndo] = useState<SavedBook | null>(null);
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
        <View style={[styles.title, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <AppText variant="title">{tr('書櫃')}</AppText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <SearchButton />
            <NotificationBell />
          </View>
        </View>
        <View style={[styles.segment, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
          {(['books', 'tbr', 'places'] as Tab[]).map((t) => {
            const selected = tab === t;
            const count = t === 'places' ? places.data?.length : t === 'tbr' ? purchases.data?.unread : books.data?.length;
            return (
              <Pressable
                key={t}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setTab(t)}
                style={[styles.segmentItem, selected && { backgroundColor: c.surface }]}>
                <AppText variant="caption" style={{ fontWeight: '700', color: selected ? c.text : c.textSecondary }}>
                  {`${t === 'places' ? tr('地點') : t === 'tbr' ? tr('積讀') : tr('想讀')} · ${count ?? 0}`}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <View style={{ alignItems: 'flex-end', paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm }}>
          <AboutLink feature={tab === 'places' ? 'place' : 'want'} />
        </View>
        <AboutIntro feature={tab === 'places' ? 'place' : 'want'} />

        {tab === 'tbr' ? (
          <TbrShelf />
        ) : tab === 'places' ? (
          <PlacesShelf />
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
            renderItem={({ item, index }) => <BookRow item={item} hint={index === 0} onUnsave={() => unsave(item)} />}
          />
        )}
        <UndoToast message={undo ? tr('已從想讀移除《{title}》', { title: undo.books.title }) : null} onUndo={restore} onHide={hideToast} />
      </SafeAreaView>
    </Screen>
  );
}

/** Y4 想讀卡片：點卡片進書的單頁；「⋯」裡有編輯、開始讀、買了、移除（我的書店的想讀也一樣） */
function BookRow({ item, hint, onUnsave }: { item: SavedBook; hint?: boolean; onUnsave: () => void }) {
  const c = useTheme();
  const from = wantSource(item);
  const start = useStartReading();
  const actions = [
    { label: tr('編輯'), icon: 'edit-2' as const, onPress: () => router.push({ pathname: '/want-book', params: { bookId: item.book_id, from: 'want' } }) },
    {
      label: tr('開始讀'),
      icon: 'book-open' as const,
      onPress: () =>
        start.mutate(item.book_id, {
          onSuccess: () => Alert.alert(tr('已移到「正在讀」'), tr('可以在我的書店 › 店主閱讀繼續寫心得。')),
          onError: (e) => Alert.alert(tr('沒有成功'), userMessage(e)),
        }),
    },
    { label: tr('買了'), sub: tr('移到積讀，記在哪買'), icon: 'shopping-bag' as const, onPress: () => router.push({ pathname: '/purchase', params: { bookId: item.book_id, from: 'want' } }) },
    { label: tr('移除'), sub: tr('6 秒內可以復原'), icon: 'trash-2' as const, destructive: true, onPress: onUnsave },
  ];
  const [menu, setMenu] = useState(false);
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <SwipeRow actions={actions} hint={hint}>
      <View style={[styles.row, { padding: Spacing.lg }]}>
      <Pressable accessibilityRole="link" {...swipeA11y(actions)} onPress={() => router.push({ pathname: '/book/[id]', params: { id: item.book_id } })} style={[styles.row, { flex: 1 }]}>
        <BookCover title={item.books.title} url={item.books.cover_url} color={item.bookstores?.color ?? 'moss'} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label">{bookTitle(item.books.title)}</AppText>
          <AppText variant="caption" muted>{item.books.authors.join(tr('、'))}</AppText>
          {from ? <AppText variant="caption" style={{ color: c.textTertiary }} numberOfLines={1}>{tr('在哪看到：{from}', { from })}</AppText> : null}
          {item.note ? <AppText variant="caption" numberOfLines={2}>{tr('「{note}」', { note: item.note })}</AppText> : null}
          <LinkLine url={item.link} />
        </View>
      </Pressable>
      <MoreButton onPress={() => setMenu(true)} label={tr('{title}的更多動作', { title: item.books.title })} />
      </View>
      </SwipeRow>
      <ActionSheet visible={menu} onClose={() => setMenu(false)} title={bookTitle(item.books.title)} actions={actions} />
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
