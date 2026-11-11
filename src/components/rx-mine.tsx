import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { Chip, chipRow } from '@/components/form';
import { AppText, Card, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';
import { taipeiDate } from '@/lib/period';
import { daysLeft, useRxMine, type RxMineReplied, type RxMineStarted } from '@/lib/rx';

/** X5 書櫃 › 處方簽：我發起的／我開的 */
export function RxMine() {
  const c = useTheme();
  const [kind, setKind] = useState<'started' | 'replied'>('started');
  const list = useRxMine(kind);

  return (
    <View style={{ flex: 1 }}>
      <View style={[chipRow, { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md }]}>
        <Chip label={tr('我發起的')} selected={kind === 'started'} onPress={() => setKind('started')} />
        <Chip label={tr('我開的')} selected={kind === 'replied'} onPress={() => setKind('replied')} />
      </View>
      {list.isPending ? (
        <ActivityIndicator style={{ marginTop: 48 }} />
      ) : list.error ? (
        <EmptyState title={tr('沒有載入成功')} body={tr('檢查網路後再試一次。')} actionLabel={tr('重試')} onAction={() => void list.refetch()} />
      ) : (
        <FlatList
          data={list.data as (RxMineStarted | RxMineReplied)[]}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
          ListEmptyComponent={
            kind === 'started' ? (
              <EmptyState title={tr('還沒有發起處方簽')} body={tr('說說你最近的狀況，請大家各開一本書。')} actionLabel={tr('發起閱讀處方簽')} onAction={() => router.push('/rx/new')} />
            ) : (
              <EmptyState title={tr('還沒有開過處方')} body={tr('到探索 › 處方簽看看誰需要一本書。')} actionLabel={tr('去看看')} onAction={() => router.navigate({ pathname: '/', params: { tab: 'rx' } })} />
            )
          }
          renderItem={({ item }) => (
            <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/rx/[id]', params: { id: item.id } })}>
              <Card style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' }}>
                  <AppText variant="label" style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>{item.title}</AppText>
                  {'new_count' in item && item.new_count && item.is_open ? (
                    <View style={[styles.badge, { backgroundColor: c.danger }]}><AppText variant="caption" style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>{tr('{n} 張新的', { n: item.new_count })}</AppText></View>
                  ) : 'owner_wants' in item && item.owner_wants ? (
                    <View style={[styles.badge, { backgroundColor: c.successSurface }]}><AppText variant="caption" style={{ color: c.success, fontSize: 11, fontWeight: '700' }}>{tr('✓ 發起人想讀')}</AppText></View>
                  ) : !item.is_open ? (
                    <View style={[styles.badge, { backgroundColor: c.surfaceMuted }]}><AppText variant="caption" muted style={{ fontSize: 11, fontWeight: '700' }}>{tr('已結案')}</AppText></View>
                  ) : null}
                </View>
                {'my_book' in item ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                    <BookCover title={item.my_book.title} url={item.my_book.cover_url} color="wisteria" size="sm" />
                    <AppText variant="caption" muted style={{ flex: 1 }}>{tr('你開了《{title}》 · {n} 人參與', { title: item.my_book.title, n: item.reply_count })}</AppText>
                  </View>
                ) : (
                  <AppText variant="caption" muted>
                    {[
                      tr('{n} 張處方', { n: item.reply_count }),
                      item.wanted_count ? tr('加入想讀 {n} 本', { n: item.wanted_count }) : null,
                      item.is_open ? tr('還有 {n} 天', { n: daysLeft(item.closes_at, true) ?? 0 }) : tr('{date} 結案', { date: taipeiDate(item.closed_at ?? item.closes_at).md }),
                      item.anonymous ? tr('匿名') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </AppText>
                )}
              </Card>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.md, flexGrow: 1, paddingBottom: 96 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.sm },
});
