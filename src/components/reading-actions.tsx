import { router } from 'expo-router';
import { Alert } from 'react-native';

import { ActionSheet, type SheetAction } from '@/components/sheet';
import { friendlyError, useAddItem, useCreateCuration } from '@/lib/curations';
import { monthOf, nextPeriod } from '@/lib/period';
import { useUpdateReading, type MyReading } from '@/lib/readings';
import { tr } from '@/lib/i18n';

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
  const fail = (e: Error) => Alert.alert(tr('沒有成功'), friendlyError(e.message));
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
    ...(!inDetail ? [{ label: tr('查看與編輯心得'), icon: 'edit-2' as const, onPress: () => router.push({ pathname: '/reading/manage/[id]', params: { id: reading.id } }) }] : []),
    reading.status === 'reading'
      ? { label: tr('標記為讀完'), icon: 'check-circle' as const, onPress: () => update.mutate({ id: reading.id, status: 'finished' }, { onError: fail }) }
      : { label: tr('改回正在讀'), icon: 'book-open' as const, onPress: () => update.mutate({ id: reading.id, status: 'reading' }, { onError: fail }) },
    reading.is_public
      ? { label: tr('從書店頁隱藏'), icon: 'eye-off' as const, sub: tr('只有自己看得到'), onPress: () => update.mutate({ id: reading.id, is_public: false }, { onError: fail }) }
      : { label: tr('顯示在書店頁'), icon: 'eye' as const, sub: tr('讀者可以在「店主閱讀」看到'), onPress: () => update.mutate({ id: reading.id, is_public: true }, { onError: fail }) },
    { label: tr('放進 {p0} 月策展', { p0: monthOf(next) }), icon: 'layers' as const, sub: tr('加到下個月的草稿書架'), onPress: () => void toNextCuration() },
    { label: tr('從店主閱讀移除'), destructive: true, onPress: onRemove },
  ];

  const n = reading.reading_notes.length;
  return (
    <ActionSheet
      visible={visible}
      title={reading.books.title}
      subtitle={tr('{p0} · {n} 則心得 · {p2}', { p0: reading.status === 'reading' ? tr('在讀') : tr('讀完'), n, p2: reading.is_public ? tr('公開在書店頁') : tr('只有自己看得到') })}
      actions={actions}
      onClose={onClose}
    />
  );
}
