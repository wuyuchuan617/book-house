import { router, Stack } from 'expo-router';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, View } from 'react-native';

import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useIsAdmin, useModerate, useModerationQueue, usePausedStores, useRecentFeedback, type QueueRow } from '@/lib/admin';
import { userMessage } from '@/lib/errors';
import { timeAgo } from '@/lib/period';

const REASON: Record<string, string> = {
  inappropriate: '不當內容', infringement: '侵權', spam: '垃圾訊息', impersonation: '冒充', other: '其他',
};

/** 審核後台：待審檢舉、已暫停的書店、最近的意見回饋。通知會帶到這裡 */
export default function AdminScreen() {
  const { data: isAdmin, isLoading } = useIsAdmin();
  const queue = useModerationQueue();
  const paused = usePausedStores();
  const feedback = useRecentFeedback();
  const moderate = useModerate();

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!isAdmin) return <EmptyState title="沒有權限" body="這個頁面只有管理員看得到。" />;

  const act = (row: { bookstore_id: string; store_name: string }, action: 'pause' | 'restore' | 'dismiss') => {
    const label = { pause: '暫停', restore: '恢復營業', dismiss: '駁回檢舉' }[action];
    Alert.alert(`${label}「${row.store_name}」？`, action === 'pause' ? '讀者會看不到這間書店，檢舉標記為已處理。' : undefined, [
      { text: '取消', style: 'cancel' },
      { text: label, style: action === 'pause' ? 'destructive' : 'default', onPress: () => moderate.mutate({ bookstoreId: row.bookstore_id, action }, { onError: (e) => Alert.alert('沒有成功', userMessage(e)) }) },
    ]);
  };
  const refresh = () => Promise.all([queue.refetch(), paused.refetch(), feedback.refetch()]);

  return (
    <Screen>
      <Stack.Screen options={{ title: '審核後台' }} />
      <ScrollView
        contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }}
        refreshControl={<RefreshControl refreshing={queue.isRefetching} onRefresh={() => void refresh()} />}>
        <AppText variant="label">{`待審檢舉 · ${queue.data?.length ?? 0}`}</AppText>
        {queue.data?.length ? queue.data.map((r) => <QueueCard key={r.bookstore_id} row={r} onAct={act} />) : <AppText muted>目前沒有待處理的檢舉。</AppText>}

        <AppText variant="label" style={{ marginTop: Spacing.md }}>{`已暫停的書店 · ${paused.data?.length ?? 0}`}</AppText>
        {paused.data?.map((s) => (
          <Card key={s.bookstore_id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
            <AppText style={{ flex: 1 }}>{s.store_name}</AppText>
            <Button kind="secondary" label="恢復營業" onPress={() => act(s, 'restore')} />
          </Card>
        ))}

        <AppText variant="label" style={{ marginTop: Spacing.md }}>最近的意見回饋</AppText>
        {feedback.data?.map((f) => (
          <Card key={f.id} style={{ gap: 4 }}>
            <AppText variant="caption" muted>{`${{ suggestion: '建議', bug: '問題回報', other: '其他' }[f.kind] ?? f.kind} · ${timeAgo(f.created_at)}${f.app_version ? ` · ${f.app_version}` : ''}`}</AppText>
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
        <AppText variant="caption" style={{ color: row.status === 'paused' ? c.danger : c.textSecondary }}>{row.status === 'paused' ? '已自動暫停' : '營業中'}</AppText>
      </View>
      <AppText variant="caption" muted>{`${row.reporter_count} 人檢舉 · ${row.reasons.map((r) => REASON[r] ?? r).join('、')} · ${timeAgo(row.last_reported_at)}`}</AppText>
      {row.details.slice(0, 3).map((d, i) => <AppText key={i} variant="caption">{`「${d}」`}</AppText>)}
      <Button kind="link" label="看這間書店" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: row.slug } })} />
      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
        {row.status === 'paused' ? (
          <Button kind="secondary" label="恢復營業" style={{ flex: 1 }} onPress={() => onAct(row, 'restore')} />
        ) : (
          <Button kind="danger" label="暫停書店" style={{ flex: 1 }} onPress={() => onAct(row, 'pause')} />
        )}
        <Button kind="secondary" label="駁回檢舉" style={{ flex: 1 }} onPress={() => onAct(row, 'dismiss')} />
      </View>
    </Card>
  );
}
