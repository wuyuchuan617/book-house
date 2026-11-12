import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { ActionSheet, type SheetAction } from '@/components/sheet';
import {
  friendlyError,
  useDeleteCuration,
  useDeleteImpact,
  useDuplicateCuration,
  useSuggestedPeriod,
  useUnpublishCuration,
  type CurationStatus,
} from '@/lib/curations';
import { currentPeriod, lastOpenPeriod, monthOf } from '@/lib/period';
import { tr } from '@/lib/i18n';

export type CurationSummary = {
  id: string;
  title: string | null;
  period: string;
  status: CurationStatus;
  book_count: number;
};

const STATUS_LABEL = (): Record<CurationStatus, string> => ({ draft: tr('草稿'), scheduled: tr('已預約'), published: tr('已發布') });

/** C7 更多操作＋C8 刪除確認（都是底部選單） */
export function CurationActions({ curation, visible, onClose, inEditor, onDeleted }: {
  curation: CurationSummary;
  visible: boolean;
  onClose: () => void;
  /** 已在編輯頁就不顯示「編輯策展」 */
  inEditor?: boolean;
  onDeleted?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const duplicate = useDuplicateCuration();
  const unpublish = useUnpublishCuration();
  const del = useDeleteCuration();
  const impact = useDeleteImpact(curation.id, confirming);
  const live = curation.status !== 'draft';
  const month = monthOf(curation.period);
  const name = curation.title || tr('{month} 月策展', { month });

  // 複製到「新增策展」的那個月（最後一檔的下一個月）；超過 4 個月內就不提供
  const { data: suggested } = useSuggestedPeriod();
  const target = suggested && suggested <= lastOpenPeriod() ? suggested : null;

  const doUnpublish = () =>
    unpublish.mutate(curation.id, { onError: (e) => Alert.alert(tr('沒有成功'), friendlyError(e.message)) });

  const actions: SheetAction[] = [
    ...(!inEditor ? [{ label: tr('編輯策展'), icon: 'edit-2' as const, onPress: () => router.push({ pathname: '/curation/[id]', params: { id: curation.id } }) }] : []),
    { label: tr('以讀者身分預覽'), icon: 'eye' as const, onPress: () => router.push({ pathname: '/curation/preview/[id]', params: { id: curation.id } }) },
    ...(target
      ? [{
          label: tr('複製為 {p0} 月草稿', { p0: monthOf(target) }),
          icon: 'copy' as const,
          sub: tr('保留書架與推薦理由'),
          onPress: () =>
            duplicate.mutate(
              { id: curation.id, period: target },
              {
                onSuccess: (c) => router.push({ pathname: '/curation/[id]', params: { id: c.id } }),
                onError: (e) => Alert.alert(tr('沒有複製成功'), friendlyError(e.message)),
              },
            ),
        }]
      : []),
    ...(live
      ? [{
          label: curation.status === 'scheduled' ? tr('取消預約') : tr('取消發布'),
          sub: tr('改回草稿，之後還能再發布'),
          onPress: doUnpublish,
        }]
      : []),
    { label: tr('刪除策展'), destructive: true, onPress: () => setConfirming(true) },
  ];

  const lines: string[] = [];
  if (impact.data) {
    if (impact.data.book_count > 0) lines.push(tr('書架上 {book_count} 本書與推薦理由會一起刪除', { book_count: impact.data.book_count }));
    if (impact.data.save_count > 0) lines.push(tr('讀者收藏的 {save_count} 筆紀錄將失效', { save_count: impact.data.save_count }));
    if (impact.data.status === 'published') lines.push(tr('書店頁的 {month} 月會變成空白', { month }));
    if (curation.period === currentPeriod() && impact.data.status === 'published') lines.push(tr('探索頁將不再顯示你的書店，直到發布新的策展'));
  }

  return (
    <>
      <ActionSheet
        visible={visible}
        title={name}
        subtitle={tr('{month} 月 · {p1} · {book_count} 本書', { month, p1: STATUS_LABEL()[curation.status], book_count: curation.book_count })}
        actions={actions}
        onClose={onClose}
      />
      {/* C8 刪除確認：跟其他選單同一種底部選單（v1.7.3 統一） */}
      <ActionSheet
        visible={confirming}
        title={tr('刪除「{name}」？', { name })}
        subtitle={impact.isLoading ? tr('正在確認會影響哪些內容…') : [tr('刪除後無法復原。'), ...lines].join('\n')}
        onClose={() => setConfirming(false)}
        actions={[
          ...(live
            ? [{ label: curation.status === 'scheduled' ? tr('改為取消預約') : tr('改為取消發布'), sub: tr('只是想先收起來：改回草稿，之後還能再發布'), icon: 'rotate-ccw' as const, onPress: doUnpublish }]
            : []),
          {
            label: tr('刪除策展'),
            sub: tr('書架與推薦理由一起刪除'),
            destructive: true,
            onPress: () =>
              del.mutate(curation.id, {
                onSuccess: () => onDeleted?.(),
                onError: (e) => Alert.alert(tr('沒有刪除成功'), friendlyError(e.message)),
              }),
          },
        ]}
      />
    </>
  );
}
