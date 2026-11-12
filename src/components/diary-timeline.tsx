import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AutoItemRow, OwnEntryCard, taipeiTime, visibilityOf } from '@/components/diary';
import { EventShareBody } from '@/components/store-journal';
import { ActionSheet } from '@/components/sheet';
import { MoreButton, SwipeRow, swipeA11y, type SwipeAction } from '@/components/swipe-row';
import { AppText } from '@/components/ui';
import { Radius, Spacing, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { diaryError, useDeleteEntry, useUnpublishEntry, type DiaryEntry, type DiaryEventShare, type DiaryItem } from '@/lib/diary';
import { eventError, useDeleteShare } from '@/lib/events';
import { tr } from '@/lib/i18n';
import { addDays } from '@/lib/diary';
import { taipeiToday } from '@/lib/period';

/**
 * D2 一天的時間軸。v1.8.2 AK4：「我寫的」分成「公開」「只有自己」兩段（卡片不再放公開標籤，上面也不再有篩選）；
 * 日記與打卡是大卡片（往左滑：今天可編輯；隨時可改成私人、刪除），
 * 「自動帶入」的心得、想讀、想去、開始讀、讀完收在下面一個框裡，可以收合。
 */
export function DiaryTimeline({ items, isToday, color, date }: { items: DiaryItem[]; isToday: boolean; color?: StoreColor; /** v1.9 AL4：這一天的日期；7 天內的日記可以編輯 */ date?: string }) {
  const c = useTheme();
  const editable = isToday || (!!date && date >= addDays(taipeiToday(), -7));
  const del = useDeleteEntry();
  const unpublish = useUnpublishEntry();
  const [autoOpen, setAutoOpen] = useState(true);
  const delShare = useDeleteShare();
  const [menuFor, setMenuFor] = useState<DiaryEntry | DiaryEventShare | null>(null);
  const fail = (e: Error) => Alert.alert(tr('沒有成功'), diaryError(e.message));

  const isOwn = (i: DiaryItem): i is DiaryEntry | DiaryEventShare => i.type === 'note' || i.type === 'checkin' || i.type === 'event_share';
  const own = items.filter(isOwn);
  const pub = own.filter((i) => visibilityOf(i).public);
  const priv = own.filter((i) => !visibilityOf(i).public);
  const auto = items.filter((i): i is Exclude<DiaryItem, DiaryEntry | DiaryEventShare> => !isOwn(i));

  // v1.8.1：分享的活動也記進日記（修改分享／看活動／刪除分享）
  const shareActions = (e: DiaryEventShare): SwipeAction[] => [
    ...(e.event.over ? [] : [{ label: tr('修改分享'), icon: 'edit-2' as const, onPress: () => router.push({ pathname: '/event/share', params: { eventId: e.event.id } }) }]),
    { label: tr('看活動'), icon: 'calendar' as const, onPress: () => router.push({ pathname: '/event/[id]', params: { id: e.event.id } }) },
    {
      label: tr('刪除分享'),
      icon: 'trash-2' as const,
      destructive: true,
      onPress: () =>
        Alert.alert(tr('刪除你的分享？'), tr('活動還會在，只是拿掉你的這則分享。'), [
          { text: tr('取消'), style: 'cancel' },
          { text: tr('刪除'), style: 'destructive', onPress: () => delShare.mutate(e.id, { onError: (err) => Alert.alert(tr('沒有成功'), eventError(err.message)) }) },
        ]),
    },
  ];

  const actionsFor = (e: DiaryEntry | DiaryEventShare): SwipeAction[] => (e.type === 'event_share' ? shareActions(e) : entryActions(e));
  const entryActions = (e: DiaryEntry): SwipeAction[] => [
    ...(editable ? [{ label: tr('編輯'), icon: 'edit-2' as const, onPress: () => router.push({ pathname: '/diary/compose', params: date && !isToday ? { entryId: e.id, date } : { entryId: e.id } }) }] : []),
    ...(e.is_public ? [{ label: tr('改成只有自己'), icon: 'lock' as const, onPress: () => unpublish.mutate(e.id, { onError: fail }) }] : []),
    {
      label: tr('刪除'),
      icon: 'trash-2' as const,
      destructive: true,
      onPress: () =>
        e.reading_note_id
          ? Alert.alert(tr('刪除這筆日記？'), tr('這則日記也存成了這本書的心得。'), [
              { text: tr('取消'), style: 'cancel' },
              { text: tr('只刪日記'), style: 'destructive', onPress: () => del.mutate({ id: e.id, photoPaths: e.photo_paths }, { onError: fail }) },
              { text: tr('日記和心得一起刪'), style: 'destructive', onPress: () => del.mutate({ id: e.id, photoPaths: e.photo_paths, withNoteId: e.reading_note_id }, { onError: fail }) },
            ])
          : Alert.alert(tr('刪除這筆日記？'), e.is_public ? tr('公開的打卡也會一起從地點頁移除，無法復原。') : tr('刪除後無法復原。'), [
              { text: tr('取消'), style: 'cancel' },
              { text: tr('刪除'), style: 'destructive', onPress: () => del.mutate({ id: e.id, photoPaths: e.photo_paths }, { onError: fail }) },
            ]),
    },
  ];

  const section = (list: (DiaryEntry | DiaryEventShare)[], isPub: boolean) =>
    list.length ? (
      <View style={{ gap: Spacing.sm }}>
        <View style={styles.secHead} accessibilityRole="header">
          <Feather name={isPub ? 'globe' : 'lock'} size={13} color={isPub ? c.success : c.textSecondary} />
          <AppText variant="caption" style={styles.section}>{isPub ? tr('公開 · {n}', { n: list.length }) : tr('只有自己 · {n}', { n: list.length })}</AppText>
          {isPub ? <AppText variant="caption" muted>{tr('書店頁、探索看得到')}</AppText> : null}
        </View>
        {list.map((e, index) => {
          const actions = actionsFor(e);
          const hint = index === 0 && (isPub || !pub.length);
          return (
            <View key={e.id} {...swipeA11y(actions)}>
              <SwipeRow actions={actions} background={c.background} hint={hint}>
                {e.type === 'event_share' ? <EventShareCard item={e} onMore={() => setMenuFor(e)} /> : <OwnEntryCard item={e} color={color} hideBadge onMore={() => setMenuFor(e)} />}
              </SwipeRow>
            </View>
          );
        })}
      </View>
    ) : null;

  return (
    <View style={{ gap: Spacing.md }}>
      {section(pub, true)}
      {section(priv, false)}

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

      {own.length ? <AppText variant="caption" style={{ color: c.textTertiary }}>{editable ? tr('點「⋯」或往左滑：可以編輯、改成只有自己、刪除') : tr('點「⋯」或往左滑：可以改成只有自己、刪除')}</AppText> : null}
      <ActionSheet visible={!!menuFor} onClose={() => setMenuFor(null)} title={(menuFor?.type === 'event_share' ? menuFor.event.title : menuFor?.body) ?? undefined} actions={menuFor ? actionsFor(menuFor) : []} />
    </View>
  );
}

function EventShareCard({ item, onMore }: { item: DiaryEventShare; onMore: () => void }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
      <AppText variant="caption" style={{ width: 38, fontSize: 11, paddingTop: 14, color: c.textTertiary }}>{taipeiTime(item.at)}</AppText>
      <View style={[styles.card, { backgroundColor: c.surface }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="calendar" size={13} color={c.event} />
          <AppText variant="caption" style={{ fontWeight: '700', color: c.event, flex: 1 }}>{tr('分享活動')}</AppText>
          <MoreButton onPress={onMore} label={tr('分享活動的更多動作')} />
        </View>
        <EventShareBody item={item} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: Radius.xl, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  section: { fontWeight: '700', paddingHorizontal: 2 },
  autoHead: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  autoBox: { borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.xl, paddingHorizontal: Spacing.lg },
});
