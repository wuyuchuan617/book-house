import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, EmptyState, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';
import { monthOf } from '@/lib/period';
import { useMyStore } from '@/lib/queries';
import { useStoreInsights } from '@/lib/store-v16';

/** W2 數據：原本在我的書店頂部的「本月拜訪」「檔策展」都收到這裡 */
export default function StoreInsightsScreen() {
  const c = useTheme();
  const { data: mine } = useMyStore();
  const { data, isPending, error, refetch } = useStoreInsights();

  if (isPending) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (error) return <EmptyState title={tr('沒有載入成功')} body={tr('檢查網路後再試一次。')} actionLabel={tr('重試')} onAction={() => void refetch()} />;

  // 伺服器還沒套用 v1.6：先用舊的三個數字
  const d = data ?? {
    followers: mine?.stats?.follower_count ?? 0,
    following: 0,
    visits_this_month: mine?.stats?.visits_this_month ?? 0,
    visits_last_month: 0,
    visitors_this_month: 0,
    saves_from_store: 0,
    published_curations: mine?.stats?.published_curation_count ?? 0,
    public_posts: 0,
    rx_replies_given: 0,
    top_curations: [],
  };
  const diff = d.visits_this_month - d.visits_last_month;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md, paddingBottom: 48 }}>
        <Card style={{ gap: 4 }}>
          <AppText variant="caption" muted>{tr('本月拜訪')}</AppText>
          <AppText style={{ fontSize: 34, fontWeight: '700' }}>{String(d.visits_this_month)}</AppText>
          <AppText variant="caption" style={{ color: diff >= 0 ? c.success : c.textSecondary }}>
            {d.visits_last_month ? (diff >= 0 ? tr('比上個月多 {n}', { n: diff }) : tr('比上個月少 {n}', { n: -diff })) : tr('上個月還沒有拜訪')}
            {d.visitors_this_month ? ` · ${tr('{n} 位讀者', { n: d.visitors_this_month })}` : ''}
          </AppText>
        </Card>
        <View style={styles.grid}>
          <Stat label={tr('追蹤者')} value={d.followers} onPress={() => router.push({ pathname: '/follows', params: { kind: 'followers' } })} />
          <Stat label={tr('追蹤中')} value={d.following} onPress={() => router.push({ pathname: '/follows', params: { kind: 'following' } })} />
          <Stat label={tr('發布的策展')} value={d.published_curations} />
          <Stat label={tr('被加入想讀')} value={d.saves_from_store} />
          <Stat label={tr('公開貼文')} value={d.public_posts} />
          <Stat label={tr('開出的處方')} value={d.rx_replies_given} />
        </View>
        {d.top_curations.length ? (
          <Card style={{ gap: Spacing.sm }}>
            <AppText variant="label">{tr('最多人看的策展')}</AppText>
            {d.top_curations.map((t) => (
              <Pressable key={t.id} accessibilityRole="link" onPress={() => router.push({ pathname: '/curation/[id]', params: { id: t.id } })} style={styles.top}>
                <View style={{ flex: 1 }}>
                  <AppText numberOfLines={1} style={{ fontWeight: '600' }}>{t.title}</AppText>
                  <AppText variant="caption" muted>{tr('{m} 月', { m: monthOf(t.period) })}</AppText>
                </View>
                <AppText variant="caption" muted>{tr('{v} 次拜訪 · {s} 人想讀', { v: t.visits, s: t.saves })}</AppText>
              </Pressable>
            ))}
          </Card>
        ) : null}
        <AppText variant="caption" style={{ color: c.textTertiary }}>{tr('只有你看得到這些數字。拜訪是策展頁被打開的次數，同一個人一天算一次。')}</AppText>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, onPress }: { label: string; value: number; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole={onPress ? 'link' : undefined} disabled={!onPress} onPress={onPress} style={styles.cell}>
      <Card style={{ gap: 2 }}>
        <AppText style={{ fontSize: 22, fontWeight: '700' }}>{String(value)}</AppText>
        <AppText variant="caption" muted>{onPress ? `${label} ›` : label}</AppText>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  cell: { width: '47.5%' },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 44 },
});
