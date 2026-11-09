import { router } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { DiaryItemRow, VisibilityBadge, visibilityOf } from '@/components/diary';
import { AppText } from '@/components/ui';
import { SwipeRow, swipeA11y, type SwipeAction } from '@/components/swipe-row';
import { Spacing, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { diaryError, useDeleteEntry, useUnpublishEntry, type DiaryEntry, type DiaryItem } from '@/lib/diary';
import { tr } from '@/lib/i18n';

/** 一天的時間軸。自己記的往左滑：今天可以編輯；任何時候都能刪除、把公開打卡改回私人 */
export function DiaryTimeline({ items, isToday, color, showSummary = true }: { items: DiaryItem[]; isToday: boolean; color?: StoreColor; showSummary?: boolean }) {
  const c = useTheme();
  const del = useDeleteEntry();
  const unpublish = useUnpublishEntry();
  const fail = (e: Error) => Alert.alert(tr('沒有成功'), diaryError(e.message));

  const actionsFor = (e: DiaryEntry): SwipeAction[] => [
    ...(isToday ? [{ label: tr('編輯'), icon: 'edit-2' as const, onPress: () => router.push({ pathname: '/diary/compose', params: { entryId: e.id } }) }] : []),
    ...(e.is_public ? [{ label: tr('改成私人'), icon: 'eye-off' as const, onPress: () => unpublish.mutate(e.id, { onError: fail }) }] : []),
    {
      label: tr('刪除'),
      icon: 'trash-2' as const,
      destructive: true,
      onPress: () =>
        Alert.alert(tr('刪除這筆日記？'), e.is_public ? tr('公開的打卡也會一起從地點頁移除，無法復原。') : tr('刪除後無法復原。'), [
          { text: tr('取消'), style: 'cancel' },
          { text: tr('刪除'), style: 'destructive', onPress: () => del.mutate({ id: e.id, photoPaths: e.photo_paths }, { onError: fail }) },
        ]),
    },
  ];

  const pub = items.filter((i) => visibilityOf(i).public).length;
  return (
    <View>
      {showSummary && items.length ? (
        <View style={styles.summary}>
          <VisibilityBadge v={{ public: false }} />
          <AppText variant="caption" muted>{tr('{n} 則', { n: items.length - pub })}</AppText>
          <View style={{ width: Spacing.md }} />
          <VisibilityBadge v={{ public: true, where: 'store' }} compact />
          <AppText variant="caption" muted>{tr('公開 {n} 則', { n: pub })}</AppText>
        </View>
      ) : null}
      {items.map((item, i) => {
        const last = i === items.length - 1;
        if (item.type !== 'note' && item.type !== 'checkin') return <DiaryItemRow key={`${item.type}-${item.id}`} item={item} color={color} last={last} />;
        const actions = actionsFor(item);
        return (
          <View key={item.id} {...swipeA11y(actions)}>
            <SwipeRow actions={actions} background={c.background}>
              <DiaryItemRow item={item} color={color} last={last} />
            </SwipeRow>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.md },
});
