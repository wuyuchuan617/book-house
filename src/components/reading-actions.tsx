import { router } from 'expo-router';
import { Alert } from 'react-native';

import { ActionSheet, type SheetAction } from '@/components/sheet';
import { friendlyError, useAddItem, useCreateCuration } from '@/lib/curations';
import { monthOf, nextPeriod } from '@/lib/period';
import { useUpdateReading, type MyReading } from '@/lib/readings';

/** R6 店主閱讀・更多操作 */
export function ReadingActions({ reading, visible, onClose, onRemove, inDetail }: {
  reading: MyReading;
  visible: boolean;
  onClose: () => void;
  onRemove: () => void;
  inDetail?: boolean;
}) {
  const update = useUpdateReading();
  const createCuration = useCreateCuration();
  const addItem = useAddItem();
  const fail = (e: Error) => Alert.alert('沒有成功', friendlyError(e.message));
  const next = nextPeriod();

  const toNextCuration = async () => {
    try {
      const cur = await createCuration.mutateAsync({ period: next });
      await addItem.mutateAsync({ curationId: cur.id, bookId: reading.books.id });
      router.push({ pathname: '/curation/[id]', params: { id: cur.id } });
    } catch (e) {
      fail(e as Error);
    }
  };

  const actions: SheetAction[] = [
    ...(!inDetail ? [{ label: '查看與編輯心得', onPress: () => router.push({ pathname: '/reading/manage/[id]', params: { id: reading.id } }) }] : []),
    reading.status === 'reading'
      ? { label: '標記為讀完', onPress: () => update.mutate({ id: reading.id, status: 'finished' }, { onError: fail }) }
      : { label: '改回正在讀', onPress: () => update.mutate({ id: reading.id, status: 'reading' }, { onError: fail }) },
    reading.is_public
      ? { label: '從書店頁隱藏', sub: '只有自己看得到', onPress: () => update.mutate({ id: reading.id, is_public: false }, { onError: fail }) }
      : { label: '顯示在書店頁', sub: '讀者可以在「店主閱讀」看到', onPress: () => update.mutate({ id: reading.id, is_public: true }, { onError: fail }) },
    { label: `放進 ${monthOf(next)} 月策展`, sub: '加到下個月的草稿書架', onPress: () => void toNextCuration() },
    { label: '從店主閱讀移除', destructive: true, onPress: onRemove },
  ];

  const n = reading.reading_notes.length;
  return (
    <ActionSheet
      visible={visible}
      title={reading.books.title}
      subtitle={`${reading.status === 'reading' ? '在讀' : '讀完'} · ${n} 則心得 · ${reading.is_public ? '公開在書店頁' : '只有自己看得到'}`}
      actions={actions}
      onClose={onClose}
    />
  );
}
