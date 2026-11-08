import { router, Stack } from 'expo-router';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, View } from 'react-native';

import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useIsAdmin, useModerate, useModerationQueue, usePausedStores, useRecentFeedback, type QueueRow } from '@/lib/admin';
import { userMessage } from '@/lib/errors';
import { timeAgo } from '@/lib/period';
import { tr } from '@/lib/i18n';

const REASON = (): Record<string, string> => ({
  inappropriate: tr('不當內容'), infringement: tr('侵權'), spam: tr('垃圾訊息'), impersonation: tr('冒充'), other: tr('其他'),
});

/** 審核後台：待審檢舉、已暫停的書店、最近的意見回饋。通知會帶到這裡 */
export default function AdminScreen() {
  const { data: isAdmin, isLoading } = useIsAdmin();
  const queue = useModerationQueue();
  const paused = usePausedStores();
  const feedback = useRecentFeedback();
  const moderate = useModerate();

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!isAdmin) return <EmptyState title={tr('沒有權限')} body={tr('這個頁面只有管理員看得到。')} />;

  const act = (row: { bookstore_id: string; store_name: string }, action: 'pause' | 'restore' | 'dismiss') => {
    const label = { pause: tr('暫停'), restore: tr('恢復營業'), dismiss: tr('駁回檢舉') }[action];
    Alert.alert(tr('{label}「{store_name}」？', { label, store_name: row.store_name }), action === 'pause' ? tr('讀者會看不到這間書店，檢舉標記為已處理。') : undefined, [
      { text: tr('取消'), style: 'cancel' },
      { text: label, style: action === 'pause' ? 'destructive' : 'default', onPress: () => moderate.mutate({ bookstoreId: row.bookstore_id, action }, { onError: (e) => Alert.alert(tr('沒有成功'), userMessage(e)) }) },
    ]);
  };
  const refresh = () => Promise.all([queue.refetch(), paused.refetch(), feedback.refetch()]);

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('審核後台') }} />
      <ScrollView
        contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }}
        refreshControl={<RefreshControl refreshing={queue.isRefetching} onRefresh={() => void refresh()} />}>
        <AppText variant="label">{tr('待審檢舉 · {p0}', { p0: queue.data?.length ?? 0 })}</AppText>
        {queue.data?.length ? queue.data.map((r) => <QueueCard key={r.bookstore_id} row={r} onAct={act} />) : <AppText muted>{tr('目前沒有待處理的檢舉。')}</AppText>}

        <AppText variant="label" style={{ marginTop: Spacing.md }}>{tr('已暫停的書店 · {p0}', { p0: paused.data?.length ?? 0 })}</AppText>
        {paused.data?.map((s) => (
          <Card key={s.bookstore_id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
            <AppText style={{ flex: 1 }}>{s.store_name}</AppText>
            <Button kind="secondary" label={tr('恢復營業')} onPress={() => act(s, 'restore')} />
          </Card>
        ))}

        <AppText variant="label" style={{ marginTop: Spacing.md }}>{tr('最近的意見回饋')}</AppText>
        {feedback.data?.map((f) => (
          <Card key={f.id} style={{ gap: 4 }}>
            <AppText variant="caption" muted>{`${{ suggestion: tr('建議'), bug: tr('問題回報'), other: tr('其他') }[f.kind] ?? f.kind} · ${timeAgo(f.created_at)}${f.app_version ? ` · ${f.app_version}` : ''}`}</AppText>
            <AppText>{f.body}</AppText>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

function QueueCard({ row, onAct }: { row: QueueRow; onAct: (row: QueueRow, action: 'pause' | 'restore' | 'dismiss') => void }) {
  const c = useTheme();
  return (
    <Card style={{ gap: Spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <AppText variant="label" style={{ fontSize: 16 }}>{row.store_name}</AppText>
        <AppText variant="caption" style={{ color: row.status === 'paused' ? c.danger : c.textSecondary }}>{row.status === 'paused' ? tr('已自動暫停') : tr('營業中')}</AppText>
      </View>
      <AppText variant="caption" muted>{tr('{reporter_count} 人檢舉 · {p1} · {p2}', { reporter_count: row.reporter_count, p1: row.reasons.map((r) => REASON()[r] ?? r).join(tr('、')), p2: timeAgo(row.last_reported_at) })}</AppText>
      {row.details.slice(0, 3).map((d, i) => <AppText key={i} variant="caption">{tr('「{d}」', { d })}</AppText>)}
      <Button kind="link" label={tr('看這間書店')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: row.slug } })} />
      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
        {row.status === 'paused' ? (
          <Button kind="secondary" label={tr('恢復營業')} style={{ flex: 1 }} onPress={() => onAct(row, 'restore')} />
        ) : (
          <Button kind="danger" label={tr('暫停書店')} style={{ flex: 1 }} onPress={() => onAct(row, 'pause')} />
        )}
        <Button kind="secondary" label={tr('駁回檢舉')} style={{ flex: 1 }} onPress={() => onAct(row, 'dismiss')} />
      </View>
    </Card>
  );
}
