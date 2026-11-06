import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { ActionSheet, Dialog, type SheetAction } from '@/components/sheet';
import { AppText, Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  friendlyError,
  useDeleteCuration,
  useDeleteImpact,
  useDuplicateCuration,
  useUnpublishCuration,
  type CurationStatus,
} from '@/lib/curations';
import { currentPeriod, monthOf, nextPeriod } from '@/lib/period';

export type CurationSummary = {
  id: string;
  title: string | null;
  period: string;
  status: CurationStatus;
  book_count: number;
};

const STATUS_LABEL: Record<CurationStatus, string> = { draft: '草稿', scheduled: '已預約', published: '已發布' };

/** C7 更多操作＋C8 刪除確認 */
export function CurationActions({ curation, visible, onClose, inEditor, onDeleted }: {
  curation: CurationSummary;
  visible: boolean;
  onClose: () => void;
  /** 已在編輯頁就不顯示「編輯策展」 */
  inEditor?: boolean;
  onDeleted?: () => void;
}) {
  const c = useTheme();
  const [confirming, setConfirming] = useState(false);
  const duplicate = useDuplicateCuration();
  const unpublish = useUnpublishCuration();
  const del = useDeleteCuration();
  const impact = useDeleteImpact(curation.id, confirming);
  const live = curation.status !== 'draft';
  const month = monthOf(curation.period);
  const name = curation.title || `${month} 月策展`;

  // 複製到「下個月」；本身就是下個月的檔就不提供
  const target = curation.period === nextPeriod() ? null : nextPeriod();

  const doUnpublish = () =>
    unpublish.mutate(curation.id, { onError: (e) => Alert.alert('沒有成功', friendlyError(e.message)) });

  const actions: SheetAction[] = [
    ...(!inEditor ? [{ label: '編輯策展', onPress: () => router.push({ pathname: '/curation/[id]', params: { id: curation.id } }) }] : []),
    { label: '以讀者身分預覽', onPress: () => router.push({ pathname: '/curation/preview/[id]', params: { id: curation.id } }) },
    ...(target
      ? [{
          label: `複製為 ${monthOf(target)} 月草稿`,
          sub: '保留書架與推薦理由',
          onPress: () =>
            duplicate.mutate(
              { id: curation.id, period: target },
              {
                onSuccess: (c) => router.push({ pathname: '/curation/[id]', params: { id: c.id } }),
                onError: (e) => Alert.alert('沒有複製成功', friendlyError(e.message)),
              },
            ),
        }]
      : []),
    ...(live
      ? [{
          label: curation.status === 'scheduled' ? '取消預約' : '取消發布',
          sub: '改回草稿，之後還能再發布',
          onPress: doUnpublish,
        }]
      : []),
    { label: '刪除策展', destructive: true, onPress: () => setConfirming(true) },
  ];

  const lines: string[] = [];
  if (impact.data) {
    if (impact.data.book_count > 0) lines.push(`書架上 ${impact.data.book_count} 本書與推薦理由會一起刪除`);
    if (impact.data.save_count > 0) lines.push(`讀者收藏的 ${impact.data.save_count} 筆紀錄將失效`);
    if (impact.data.status === 'published') lines.push(`書店頁的 ${month} 月會變成空白`);
    if (curation.period === currentPeriod() && impact.data.status === 'published') lines.push('探索頁將不再顯示你的書店，直到發布新的策展');
  }

  return (
    <>
      <ActionSheet
        visible={visible}
        title={name}
        subtitle={`${month} 月 · ${STATUS_LABEL[curation.status]} · ${curation.book_count} 本書`}
        actions={actions}
        onClose={onClose}
      />
      <Dialog visible={confirming} onClose={() => setConfirming(false)}>
        <AppText variant="heading">{`刪除「${name}」？`}</AppText>
        {impact.isLoading ? (
          <ActivityIndicator />
        ) : (
          <View style={{ gap: 4 }}>
            <AppText muted>刪除後無法復原：</AppText>
            {lines.map((l) => <AppText key={l} variant="caption">{`• ${l}`}</AppText>)}
          </View>
        )}
        {live ? (
          <Card style={{ gap: 4, backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border }}>
            <AppText variant="label">只是想先收起來？</AppText>
            <AppText variant="caption" muted>取消發布會改回草稿，之後還能再發布。</AppText>
            <Button kind="secondary" label="改為取消發布" style={{ marginTop: Spacing.sm }} onPress={() => { setConfirming(false); doUnpublish(); }} />
          </Card>
        ) : null}
        <Button
          kind="danger"
          label="刪除策展"
          loading={del.isPending}
          onPress={() =>
            del.mutate(curation.id, {
              onSuccess: () => {
                setConfirming(false);
                onDeleted?.();
              },
              onError: (e) => Alert.alert('沒有刪除成功', friendlyError(e.message)),
            })
          }
        />
        <Button kind="link" label="返回" onPress={() => setConfirming(false)} />
      </Dialog>
    </>
  );
}
