import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { AppText, Card, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { tr } from '@/lib/i18n';
import { timeAgo } from '@/lib/period';
import { useStoreRx } from '@/lib/store-v16';
import { authorName, daysLeft, rxTagLabel, useRxList, type RxFilter, type RxListItem } from '@/lib/rx';

export const RX_PURPLE = '#5A4B8A';

export const RX_FILTERS = (): [RxFilter, string][] => [
  ['latest', tr('最新')],
  ['unanswered', tr('還沒人開')],
  ['popular', tr('最多處方')],
];

/**
 * X1 探索 › 處方簽（v1.6）：排序與標籤由上面的「篩選」決定；
 * 最上面一張主題卡＝最需要人開的（開放中、處方最少）。
 */
export function RxExplore({ filter, tag }: { filter: RxFilter; tag?: string }) {
  const { requireAuth } = useAuth();
  const list = useRxList(filter, tag);
  const data = list.data ?? [];
  const need = filter === 'latest' && !tag ? [...data].filter((r) => r.is_open && !r.is_mine && !r.my_replied).sort((a, b) => a.reply_count - b.reply_count)[0] : undefined;
  const rest = need ? data.filter((r) => r.id !== need.id) : data;

  return (
    <View style={{ flex: 1 }}>
      {list.isPending ? (
        <ActivityIndicator style={{ marginTop: 48 }} />
      ) : list.error ? (
        <EmptyState title={tr('沒有載入成功')} body={tr('檢查網路後再試一次。')} actionLabel={tr('重試')} onAction={() => void list.refetch()} />
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md, flexGrow: 1, paddingBottom: 96 }}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
          ListHeaderComponent={need ? <NeedCard item={need} /> : undefined}
          ListEmptyComponent={
            need ? undefined : (
              <EmptyState
                title={filter === 'unanswered' ? tr('每一張都有人開了') : tr('還沒有處方簽')}
                body={tr('說說你最近的狀況或想找什麼書，請大家各開一本。')}
                actionLabel={tr('發起閱讀處方簽')}
                onAction={() => requireAuth(() => router.push('/rx/new'))}
              />
            )
          }
          renderItem={({ item }) => <RxCard item={item} />}
        />
      )}
    </View>
  );
}

/** 主題卡：最需要人開的處方簽（深紫底） */
function NeedCard({ item }: { item: RxListItem }) {
  const { requireAuth } = useAuth();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/rx/[id]', params: { id: item.id } })} style={styles.need}>
      <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '700' }}>{tr('最需要人開的')}</AppText>
      <AppText style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700', lineHeight: 26 }}>{`℞ ${item.title}`}</AppText>
      <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>
        {`${authorName(item.author)} · ${item.reply_count ? tr('{n} 張處方', { n: item.reply_count }) : tr('還沒有人開')}`}
      </AppText>
      <Pressable
        accessibilityRole="button"
        onPress={() => requireAuth(() => router.push({ pathname: '/rx/reply', params: { id: item.id } }))}
        style={styles.needBtn}>
        <AppText style={{ color: '#3F3566', fontWeight: '700' }}>{tr('℞ 開一張處方')}</AppText>
      </Pressable>
    </Pressable>
  );
}

/** 書店頁 › 處方簽（v1.6）：這間書店的店主發起的（不含匿名） */
export function StoreRxTab({ slug }: { slug: string }) {
  const list = useStoreRx(slug);
  if (list.isPending) return <ActivityIndicator style={{ marginTop: 24 }} />;
  if (!list.data?.length) return <EmptyState title={tr('店主還沒有公開的處方簽')} body={tr('店主發起的閱讀處方簽會出現在這裡。')} />;
  return <View style={{ gap: Spacing.md }}>{list.data.map((r) => <RxCard key={r.id} item={r} />)}</View>;
}

export function RxCard({ item }: { item: RxListItem }) {
  const c = useTheme();
  const left = daysLeft(item.closes_at, item.is_open);
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/rx/[id]', params: { id: item.id } })}>
      <Card style={{ gap: Spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' }}>
          <AppText style={{ fontSize: 20, color: RX_PURPLE, fontWeight: '700', lineHeight: 24 }}>℞</AppText>
          <AppText variant="heading" style={{ flex: 1, fontSize: 16, lineHeight: 23 }}>{item.title}</AppText>
          {!item.is_open ? (
            <View style={[styles.tag, { backgroundColor: c.surfaceMuted }]}><AppText variant="caption" muted style={{ fontSize: 11, fontWeight: '700' }}>{tr('已結案')}</AppText></View>
          ) : item.my_replied ? (
            <View style={[styles.tag, { backgroundColor: c.successSurface }]}><AppText variant="caption" style={{ fontSize: 11, fontWeight: '700', color: c.success }}>{tr('你開過')}</AppText></View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {item.tags.map((t) => (
            <View key={t} style={[styles.tag, { backgroundColor: c.surfaceMuted }]}><AppText variant="caption" muted style={{ fontSize: 11, fontWeight: '700' }}>{rxTagLabel(t)}</AppText></View>
          ))}
          <AppText variant="caption" muted>{`${authorName(item.author)} · ${timeAgo(item.created_at)}${left ? ` · ${tr('還有 {n} 天', { n: left })}` : ''}`}</AppText>
        </View>
        {item.reply_count ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {item.covers.map((b) => <BookCover key={b.id} title={b.title} url={b.cover_url} color="wisteria" size="sm" />)}
            <AppText variant="caption" muted style={{ marginLeft: 4 }}>{tr('{n} 張處方', { n: item.reply_count })}</AppText>
          </View>
        ) : item.is_open && !item.is_mine ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Feather name="edit-3" size={13} color={c.primary} />
            <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('還沒有人開 · 搶先開一張 ›')}</AppText>
          </View>
        ) : (
          <AppText variant="caption" muted>{tr('還沒有人開')}</AppText>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.sm },
  chips: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, gap: Spacing.sm, alignItems: 'center' },
  sep: { width: 1, height: 20, marginHorizontal: 2 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.sm },
  need: { backgroundColor: '#3F3566', borderRadius: 18, padding: Spacing.lg, gap: 6, marginBottom: Spacing.xs },
  needBtn: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: Radius.pill, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center', marginTop: 4 },
});
