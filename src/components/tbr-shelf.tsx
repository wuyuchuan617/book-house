import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { ActionSheet, type SheetAction } from '@/components/sheet';
import { MoreButton, SwipeRow, swipeA11y } from '@/components/swipe-row';
import { AppText, Card, EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { userMessage } from '@/lib/errors';
import { bookTitle, tr } from '@/lib/i18n';
import { FORMAT_LABEL, useDeletePurchase, useMyPurchases, useSetPurchaseStatus, waitedDays, type Purchase } from '@/lib/purchases';
import { useMyStore } from '@/lib/queries';
import { useAddReading } from '@/lib/readings';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** Y12 書櫃 › 積讀：買了還沒讀的書（舊的排前面），上面是今年買了幾本與「購書紀錄」 */
export function TbrShelf({ right }: { right?: React.ReactNode } = {}) {
  const c = useTheme();
  const { data, isPending, refetch, isRefetching } = useMyPurchases();
  const { data: mine } = useMyStore();
  const [menuFor, setMenuFor] = useState<Purchase | null>(null);
  const setStatus = useSetPurchaseStatus();
  const del = useDeletePurchase();
  const add = useAddReading();
  const fail = (e: Error) => Alert.alert(tr('沒有成功'), userMessage(e));
  if (isPending) return <ActivityIndicator style={{ marginTop: 48 }} />;
  const unread = (data?.items ?? []).filter((p) => p.status === 'unread').sort((a, b) => a.bought_on.localeCompare(b.bought_on));

  const actionsFor = (p: Purchase): SheetAction[] => [
    {
      label: tr('開始讀'),
      icon: 'book-open',
      onPress: () =>
        add.mutate(
          { bookId: p.book_id, status: 'reading', isPublic: mine?.store.reading_public_default ?? true },
          { onSuccess: () => Alert.alert(tr('已移到「正在讀」'), tr('可以在我的書店 › 店主閱讀繼續寫心得。')), onError: fail },
        ),
    },
    { label: tr('編輯購書資料'), icon: 'edit-2', onPress: () => router.push({ pathname: '/purchase', params: { bookId: p.book_id } }) },
    { label: tr('送人了／不讀了'), sub: tr('移出積讀，購書紀錄還在'), icon: 'archive', onPress: () => setStatus.mutate({ id: p.id, status: 'gone' }, { onError: fail }) },
    {
      label: tr('刪除購書紀錄'),
      destructive: true,
      onPress: () =>
        Alert.alert(tr('刪除這筆購書紀錄？'), bookTitle(p.book.title), [
          { text: tr('取消'), style: 'cancel' },
          { text: tr('刪除'), style: 'destructive', onPress: () => del.mutate(p.id, { onError: fail }) },
        ]),
    },
  ];

  return (
    <>
      <FlatList
        data={unread}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        ListHeaderComponent={
          <View style={{ gap: Spacing.md }}>
          {right ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: -Spacing.xs }}>
              <AppText variant="caption" muted style={{ flex: 1 }}>{tr('買了還沒讀，最久的在最上面')}</AppText>
              {right}
            </View>
          ) : null}
          <Card style={styles.stats}>
            <View>
              <AppText style={styles.n}>{String(data?.unread ?? 0)}</AppText>
              <AppText variant="caption" muted>{tr('本還沒讀')}</AppText>
            </View>
            <View>
              <AppText style={styles.n}>{String(data?.this_year ?? 0)}</AppText>
              <AppText variant="caption" muted>{tr('今年買的')}</AppText>
            </View>
            <Pressable accessibilityRole="link" onPress={() => router.push('/purchases')} style={{ flex: 1, alignItems: 'flex-end' }} hitSlop={8}>
              <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('購書紀錄 ›')}</AppText>
            </Pressable>
          </Card>
          </View>
        }
        ListEmptyComponent={
          <EmptyState title={tr('積讀是空的')} body={tr('買了一本書，按右下角的＋ › 買了一本書，或在想讀的「⋯」選「買了」。')} actionLabel={tr('記一本買的書')} onAction={() => router.push('/purchase')} />
        }
        renderItem={({ item, index }) => {
          const actions = actionsFor(item);
          const where = item.place_name ?? item.store_label;
          const days = waitedDays(item.bought_on);
          return (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <SwipeRow actions={actions.map((a) => ({ label: a.label, icon: a.icon ?? 'trash-2', destructive: a.destructive, onPress: a.onPress }))} hint={index === 0}>
                <View style={[styles.row, { padding: Spacing.md }]}>
                  <Pressable accessibilityRole="link" {...swipeA11y(actions)} onPress={() => router.push({ pathname: '/book/[id]', params: { id: item.book_id } })} style={[styles.row, { flex: 1 }]}>
                    <BookCover title={item.book.title} url={item.book.cover_url} color={mine?.store.color ?? 'moss'} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="label" numberOfLines={2}>{bookTitle(item.book.title)}</AppText>
                      <AppText variant="caption" muted numberOfLines={1}>
                        {[tr('{date} 買', { date: md(item.bought_on) }), where, item.format !== 'paper' ? FORMAT_LABEL()[item.format] : null].filter(Boolean).join(' · ')}
                      </AppText>
                      <AppText variant="caption" style={{ color: days > 60 ? c.danger : c.textTertiary }}>{days === 0 ? tr('今天買的') : tr('等了 {n} 天', { n: days })}</AppText>
                    </View>
                  </Pressable>
                  <MoreButton onPress={() => setMenuFor(item)} label={tr('{title}的更多動作', { title: item.book.title })} />
                </View>
              </SwipeRow>
            </Card>
          );
        }}
      />
      <ActionSheet visible={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor ? bookTitle(menuFor.book.title) : undefined} actions={menuFor ? actionsFor(menuFor) : []} />
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.xl, gap: Spacing.md, flexGrow: 1, paddingBottom: 48 },
  stats: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xl },
  n: { fontSize: 22, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
});
