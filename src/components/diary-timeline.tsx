import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AutoItemRow, OwnEntryCard, visibilityOf } from '@/components/diary';
import { ActionSheet } from '@/components/sheet';
import { MoreButton, SwipeRow, swipeA11y, type SwipeAction } from '@/components/swipe-row';
import { AppText } from '@/components/ui';
import { Radius, Spacing, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { diaryError, useDeleteEntry, useUnpublishEntry, type DiaryEntry, type DiaryItem } from '@/lib/diary';
import { tr } from '@/lib/i18n';

type Filter = 'all' | 'private' | 'public';

/**
 * D2 一天的時間軸：上方篩選（全部／只有自己／公開）；
 * 「我寫的」日記與打卡是大卡片（往左滑：今天可編輯；隨時可改成私人、刪除），
 * 「自動帶入」的心得、想讀、想去、開始讀、讀完收在下面一個框裡，可以收合。
 */
export function DiaryTimeline({ items, isToday, color }: { items: DiaryItem[]; isToday: boolean; color?: StoreColor }) {
  const c = useTheme();
  const del = useDeleteEntry();
  const unpublish = useUnpublishEntry();
  const [filter, setFilter] = useState<Filter>('all');
  const [autoOpen, setAutoOpen] = useState(true);
  const [menuFor, setMenuFor] = useState<DiaryEntry | null>(null);
  const fail = (e: Error) => Alert.alert(tr('沒有成功'), diaryError(e.message));

  const pubCount = items.filter((i) => visibilityOf(i).public).length;
  const shown = items.filter((i) => filter === 'all' || (filter === 'public') === visibilityOf(i).public);
  const own = shown.filter((i): i is DiaryEntry => i.type === 'note' || i.type === 'checkin');
  const auto = shown.filter((i): i is Exclude<DiaryItem, DiaryEntry> => i.type !== 'note' && i.type !== 'checkin');

  const actionsFor = (e: DiaryEntry): SwipeAction[] => [
    ...(isToday ? [{ label: tr('編輯'), icon: 'edit-2' as const, onPress: () => router.push({ pathname: '/diary/compose', params: { entryId: e.id } }) }] : []),
    ...(e.is_public ? [{ label: tr('改成只有自己'), icon: 'lock' as const, onPress: () => unpublish.mutate(e.id, { onError: fail }) }] : []),
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

  const FILTERS: [Filter, string, number][] = [
    ['all', tr('全部 {n}', { n: items.length }), items.length],
    ['private', tr('只有自己 {n}', { n: items.length - pubCount }), items.length - pubCount],
    ['public', tr('公開 {n}', { n: pubCount }), pubCount],
  ];

  return (
    <View style={{ gap: Spacing.md }}>
      <View style={{ flexDirection: 'row', gap: Spacing.sm }} accessibilityRole="tablist">
        {FILTERS.map(([f, label]) => {
          const on = filter === f;
          return (
            <Pressable
              key={f}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setFilter(f)}
              style={[styles.filter, { backgroundColor: on ? c.text : c.surface, borderColor: on ? c.text : c.border }]}>
              {f !== 'all' ? <Feather name={f === 'public' ? 'globe' : 'lock'} size={12} color={on ? c.background : f === 'public' ? c.success : c.textSecondary} /> : null}
              <AppText variant="caption" style={{ fontWeight: '700', color: on ? c.background : c.text }}>{label}</AppText>
            </Pressable>
          );
        })}
      </View>

      {own.length ? (
        <View style={{ gap: Spacing.sm }}>
          <AppText variant="caption" style={styles.section}>{tr('我寫的')}</AppText>
          {own.map((e, index) => {
            const actions = actionsFor(e);
            return (
              <View key={e.id} {...swipeA11y(actions)}>
                <SwipeRow actions={actions} background={c.background} hint={index === 0}>
                  <View>
                    <OwnEntryCard item={e} color={color} />
                    <View style={styles.more}>
                      <MoreButton onPress={() => setMenuFor(e)} />
                    </View>
                  </View>
                </SwipeRow>
              </View>
            );
          })}
        </View>
      ) : null}

      {auto.length ? (
        <View style={{ gap: Spacing.sm }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: autoOpen }} onPress={() => setAutoOpen(!autoOpen)} style={styles.autoHead}>
            <AppText variant="caption" style={[styles.section, { flex: 1 }]}>{tr('自動帶入 · {n}', { n: auto.length })}</AppText>
            <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{autoOpen ? tr('收合') : tr('展開')}</AppText>
            <Feather name={autoOpen ? 'chevron-up' : 'chevron-down'} size={14} color={c.primary} />
          </Pressable>
          {autoOpen ? (
            <View style={[styles.autoBox, { borderColor: c.border }]}>
              {auto.map((i, idx) => <AutoItemRow key={`${i.type}-${i.id}`} item={i} first={idx === 0} />)}
            </View>
          ) : null}
        </View>
      ) : null}

      {!own.length && !auto.length ? <AppText variant="caption" muted style={{ textAlign: 'center', paddingVertical: Spacing.lg }}>{tr('這個篩選沒有項目。')}</AppText> : null}
      {own.length ? <AppText variant="caption" style={{ color: c.textTertiary }}>{isToday ? tr('點「⋯」或往左滑：可以編輯、改成只有自己、刪除') : tr('點「⋯」或往左滑：可以改成只有自己、刪除')}</AppText> : null}
      <ActionSheet visible={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.body ?? undefined} actions={menuFor ? actionsFor(menuFor) : []} />
    </View>
  );
}

const styles = StyleSheet.create({
  filter: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 34, paddingHorizontal: 12, borderRadius: Radius.pill, borderWidth: 1 },
  section: { fontWeight: '700', paddingHorizontal: 2 },
  autoHead: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  autoBox: { borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.xl, paddingHorizontal: Spacing.lg },
  more: { position: 'absolute', top: 6, right: 6 },
});
