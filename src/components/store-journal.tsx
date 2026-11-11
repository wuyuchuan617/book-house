import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { BookLine, VisibilityBadge } from '@/components/diary';
import { Chip, chipRow } from '@/components/form';
import { SwipeRow, swipeA11y, type SwipeAction } from '@/components/swipe-row';
import { AppText, Card } from '@/components/ui';
import { Radius, Spacing, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { useToggleSave } from '@/lib/browse';
import { categoryLabel, diaryError, useDeleteEntry, useDiaryImageUrls, useSavePlace, useSetJournalPublic, useStoreJournal, type JournalItem } from '@/lib/diary';
import { rxError, useRxAction, useRxWithdraw } from '@/lib/rx';
import { taipeiDate, taipeiToday } from '@/lib/period';
import { tr } from '@/lib/i18n';

type Filter = 'all' | 'want' | 'place' | 'post' | 'rx';

/**
 * 店主手記：想讀、想去、日記貼文依時間混在一起。
 * mine（G2）：自己看全部，每一則標出書店頁看不看得到，點標籤可以切換；讀者（G4）：只看公開的。
 */
export function StoreJournal({ bookstoreId, color, mine }: { bookstoreId: string; color: StoreColor; mine?: boolean }) {
  const c = useTheme();
  const { data, isLoading, error, refetch } = useStoreJournal(bookstoreId);
  const [filter, setFilter] = useState<Filter>('all');
  const setPublic = useSetJournalPublic();
  const toggleSave = useToggleSave();
  const savePlace = useSavePlace();
  const delEntry = useDeleteEntry();
  const rxAction = useRxAction();
  const withdraw = useRxWithdraw();
  const [undo, setUndo] = useState<Extract<JournalItem, { type: 'want' | 'place' }> | null>(null);
  // 移除後 6 秒內可以復原（列表在捲動區裡，所以用列表上方的提示，不用浮動的 toast）
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  if (error)
    return (
      <Card style={{ alignItems: 'center', gap: Spacing.sm, paddingVertical: 24 }}>
        <AppText variant="label">{tr('店主手記沒有載入成功')}</AppText>
        <Pressable accessibilityRole="button" onPress={() => void refetch()}>
          <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('重試')}</AppText>
        </Pressable>
      </Card>
    );
  if (isLoading || !data) return <ActivityIndicator style={{ marginTop: 32 }} />;
  const items = data.filter((i) => filter === 'all' || i.type === filter || (filter === 'rx' && i.type === 'rx_reply'));

  const toggle = (item: JournalItem) => {
    if (item.type === 'rx' || item.type === 'rx_reply') {
      return Alert.alert(
        tr('閱讀處方簽'),
        item.type === 'rx' && !item.is_public ? tr('這張是匿名發起的，不會出現在書店頁。') : tr('處方簽要不要出現在書店頁，看「公開設定」裡的「閱讀處方簽」。'),
      );
    }
    const value = !item.is_public;
    if (value && item.type === 'place' && !item.public_ok) return Alert.alert(tr('私人地點不能公開'), tr('住家等私人地點只會留在自己的書櫃裡。'));
    track('journal_visibility_changed', { type: item.type, value });
    setPublic.mutate(
      { item, value },
      {
        onError: (e) =>
          Alert.alert(
            tr('沒有成功'),
            e.message.includes('only be written for today') ? tr('過了當天的日記只能改成只有自己，不能再公開。') : diaryError(e.message),
          ),
      },
    );
  };

  const fail = (e: Error) => Alert.alert(tr('沒有成功'), item_error(e.message));
  const confirm = (title: string, body: string, label: string, run: () => void) =>
    Alert.alert(title, body, [
      { text: tr('取消'), style: 'cancel' },
      { text: label, style: 'destructive', onPress: run },
    ]);

  // 往左滑：想讀、想去＝編輯／移除（可復原）；日記貼文＝今天的編輯／改私人／刪除，過去的改私人／刪除；
  // 我開的處方＝修改／撤回；我發起的處方簽＝（沒人開才有）編輯／結案／刪除
  const actionsFor = (item: JournalItem): SwipeAction[] => {
    switch (item.type) {
      case 'want':
        return [
          { label: tr('編輯'), icon: 'edit-2', onPress: () => router.push({ pathname: '/want-book', params: { bookId: item.id } }) },
          { label: tr('移除'), icon: 'trash-2', destructive: true, onPress: () => toggleSave.mutate({ bookId: item.id, save: false }, { onSuccess: () => setUndo(item), onError: fail }) },
        ];
      case 'place':
        return [
          {
            label: tr('編輯'),
            icon: 'edit-2',
            onPress: () =>
              router.push({ pathname: '/diary/compose', params: { kind: 'want', placeId: item.place.id, placeName: item.place.name, googlePlaceId: 'saved', publicOk: item.public_ok ? '1' : '0', saved: '1', note: item.note ?? '' } }),
          },
          { label: tr('移除'), icon: 'trash-2', destructive: true, onPress: () => savePlace.mutate({ placeId: item.place.id, save: false }, { onSuccess: () => setUndo(item), onError: fail }) },
        ];
      case 'post': {
        const today = item.entry_date === taipeiToday();
        return [
          ...(today ? [{ label: tr('編輯'), icon: 'edit-2' as const, onPress: () => router.push({ pathname: '/diary/compose', params: { entryId: item.id } }) }] : []),
          ...(item.is_public ? [{ label: tr('改成私人'), icon: 'eye-off' as const, onPress: () => setPublic.mutate({ item, value: false }, { onError: fail }) }] : []),
          {
            label: tr('刪除'),
            icon: 'trash-2',
            destructive: true,
            onPress: () =>
              confirm(tr('刪除這筆日記？'), item.is_public ? tr('公開的貼文也會一起從探索和地點頁移除，無法復原。') : tr('刪除後無法復原。'), tr('刪除'), () =>
                delEntry.mutate({ id: item.id, photoPaths: item.photo_paths }, { onError: fail }),
              ),
          },
        ];
      }
      case 'rx_reply':
        return [
          { label: tr('修改'), icon: 'edit-2', onPress: () => router.push({ pathname: '/rx/reply', params: { id: item.prescription.id } }) },
          {
            label: tr('撤回'),
            icon: 'rotate-ccw',
            destructive: true,
            onPress: () => confirm(tr('撤回這張處方？'), tr('撤回後可以再開一次。'), tr('撤回'), () => withdraw.mutate(item.prescription.id, { onError: fail })),
          },
        ];
      case 'rx':
        return [
          ...(item.is_open && item.reply_count === 0 ? [{ label: tr('編輯'), icon: 'edit-2' as const, onPress: () => router.push({ pathname: '/rx/new', params: { id: item.id } }) }] : []),
          ...(item.is_open ? [{ label: tr('結案'), icon: 'check-circle' as const, onPress: () => rxAction.mutate({ id: item.id, action: 'close' }, { onError: fail }) }] : []),
          {
            label: tr('刪除'),
            icon: 'trash-2',
            destructive: true,
            onPress: () => confirm(tr('刪除這張處方簽？'), tr('大家開的處方會一起刪除，無法復原。'), tr('刪除'), () => rxAction.mutate({ id: item.id, action: 'delete' }, { onError: fail })),
          },
        ];
    }
  };

  const restore = () => {
    if (!undo) return;
    if (undo.type === 'want') toggleSave.mutate({ bookId: undo.id, save: true, note: undo.note, sourceText: undo.source_text });
    else savePlace.mutate({ placeId: undo.place.id, save: true, note: undo.note });
    setUndo(null);
  };

  const FILTERS: [Filter, string][] = [
    ['all', tr('全部')],
    ['want', tr('想讀')],
    ['place', tr('想去')],
    ['post', tr('日記')],
    ['rx', tr('處方簽')],
  ];

  return (
    <View style={{ gap: Spacing.md }}>
      <View style={chipRow}>
        {FILTERS.map(([f, label]) => <Chip key={f} label={label} selected={filter === f} onPress={() => setFilter(f)} />)}
      </View>
      {undo ? (
        <View style={[styles.undo, { backgroundColor: c.text }]} accessibilityLiveRegion="polite">
          <AppText variant="caption" style={{ color: c.background, flex: 1 }} numberOfLines={1}>
            {undo.type === 'want' ? tr('已從想讀移除「{title}」', { title: undo.book.title }) : tr('已從想去移除「{name}」', { name: undo.place.name })}
          </AppText>
          <Pressable accessibilityRole="button" onPress={restore} hitSlop={8}>
            <AppText variant="caption" style={{ color: c.background, fontWeight: '700' }}>{tr('復原')}</AppText>
          </Pressable>
        </View>
      ) : null}
      {items.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 24 }}>
          <AppText variant="label">{mine ? tr('這裡還沒有東西') : tr('店主還沒有公開的手記')}</AppText>
          <AppText variant="caption" muted style={{ textAlign: 'center' }}>
            {mine ? tr('按右下角的＋記想讀的書、想去的地點或寫日記，設成公開就會出現在書店頁。') : tr('店主公開的想讀、想去和日記會出現在這裡。')}
          </AppText>
        </Card>
      ) : (
        items.map((item) => {
          const card = <JournalCard item={item} color={color} mine={mine} onToggle={() => toggle(item)} />;
          if (!mine) return <View key={`${item.type}-${item.id}`}>{card}</View>;
          const actions = actionsFor(item);
          return (
            <View key={`${item.type}-${item.id}`} style={{ borderRadius: Radius.xl, overflow: 'hidden' }} {...swipeA11y(actions)}>
              <SwipeRow actions={actions} background={c.background}>
                {card}
              </SwipeRow>
            </View>
          );
        })
      )}
      {mine && items.length ? (
        <AppText variant="caption" style={{ color: c.textTertiary }}>{tr('往左滑可以編輯、移除；點右上角的標籤切換「書店頁／只有自己」。哪幾類會顯示，看上方的「公開設定」。')}</AppText>
      ) : null}

    </View>
  );
}

const item_error = (m: string) => (/prescription|處方/.test(m) ? rxError(m) : diaryError(m));

function JournalCard({ item, color, mine, onToggle }: { item: JournalItem; color: StoreColor; mine?: boolean; onToggle: () => void }) {
  const c = useTheme();
  const kind = item.type === 'rx' || item.type === 'rx_reply' ? { label: item.type === 'rx' ? tr('發起處方簽') : tr('開了處方'), fg: '#5A4B8A', icon: 'message-circle' as const } : item.type === 'want' ? { label: tr('想讀'), fg: c.primary, icon: 'bookmark' as const } : item.type === 'place' ? { label: tr('想去'), fg: '#2F5D6B', icon: 'map-pin' as const } : item.book ? { label: tr('正在讀'), fg: c.success, icon: 'play' as const } : item.kind === 'checkin' ? { label: tr('打卡'), fg: '#5A4B8A', icon: 'map-pin' as const } : { label: tr('日記'), fg: '#5A4B8A', icon: 'edit-3' as const };
  const date = item.type === 'post' ? taipeiDate(`${item.entry_date}T04:00:00Z`).md : taipeiDate(item.at).md;

  return (
    <View style={[styles.card, { backgroundColor: c.surface }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Feather name={kind.icon} size={13} color={kind.fg} />
        <AppText variant="caption" style={{ fontWeight: '700', color: kind.fg }}>{kind.label}</AppText>
        <AppText variant="caption" muted style={{ flex: 1 }}>{`· ${date}`}</AppText>
        {mine ? (
          <Pressable accessibilityRole="button" accessibilityLabel={item.shown ? tr('改成只有自己') : tr('顯示在書店頁')} hitSlop={8} onPress={onToggle}>
            {item.shown ? (
              <VisibilityBadge v={{ public: true, where: 'store' }} />
            ) : item.is_public ? (
              <AppText variant="caption" style={{ fontSize: 11, color: c.textTertiary }}>{tr('公開・這類沒開')}</AppText>
            ) : (
              <VisibilityBadge v={{ public: false }} />
            )}
          </Pressable>
        ) : null}
      </View>

      {item.type === 'want' ? (
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/book/[id]', params: { id: item.book.id } })} style={{ flexDirection: 'row', gap: Spacing.md }}>
          <BookCover title={item.book.title} url={item.book.cover_url} color={color} size="sm" />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label">{item.book.title}</AppText>
            {item.note ? <AppText style={{ lineHeight: 21 }}>{item.note}</AppText> : null}
            {item.source_text ? <AppText variant="caption" muted>{tr('在哪看到：{s}', { s: item.source_text })}</AppText> : null}
          </View>
        </Pressable>
      ) : item.type === 'place' ? (
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/place/[id]', params: { id: item.place.id } })} style={{ gap: 2 }}>
          <AppText style={{ fontSize: 16, fontWeight: '700', color: c.primary }}>{`${item.place.name} ›`}</AppText>
          {item.place.category ? <AppText variant="caption" muted>{categoryLabel(item.place.category)}</AppText> : null}
          {item.note ? <AppText style={{ lineHeight: 21, marginTop: 2 }}>{item.note}</AppText> : null}
        </Pressable>
      ) : item.type === 'rx' ? (
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/rx/[id]', params: { id: item.id } })} style={{ gap: 2 }}>
          <AppText style={{ fontSize: 16, fontWeight: '700', lineHeight: 23 }}>{`℞ ${item.title}`}</AppText>
          <AppText variant="caption" muted>{[tr('{n} 張處方', { n: item.reply_count }), item.is_open ? null : tr('已結案')].filter(Boolean).join(' · ')}</AppText>
        </Pressable>
      ) : item.type === 'rx_reply' ? (
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/rx/[id]', params: { id: item.prescription.id } })} style={{ gap: Spacing.sm }}>
          <AppText variant="caption" muted numberOfLines={2}>{`℞ ${item.prescription.title}`}</AppText>
          <View style={{ flexDirection: 'row', gap: Spacing.md }}>
            <BookCover title={item.book.title} url={item.book.cover_url} color={color} size="sm" />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="label">{item.book.title}</AppText>
              <AppText style={{ lineHeight: 21 }}>{item.reason}</AppText>
            </View>
          </View>
        </Pressable>
      ) : (
        <PostBody item={item} color={color} />
      )}
    </View>
  );
}

function PostBody({ item, color }: { item: Extract<JournalItem, { type: 'post' }>; color: StoreColor }) {
  const c = useTheme();
  const photos = useDiaryImageUrls(item.photo_paths);
  const placeName = item.place?.name ?? item.place_label;
  return (
    <View style={{ gap: Spacing.sm }}>
      {placeName ? (
        <Pressable accessibilityRole={item.place ? 'link' : undefined} disabled={!item.place} onPress={() => item.place && router.push({ pathname: '/place/[id]', params: { id: item.place.id } })}>
          <AppText style={{ fontWeight: '700', color: item.place ? c.primary : c.text }}>{item.place ? `⌖ ${placeName} ›` : `⌖ ${placeName}`}</AppText>
        </Pressable>
      ) : null}
      {item.body ? <AppText style={{ fontSize: 15, lineHeight: 23 }}>{item.body}</AppText> : null}
      {item.photo_paths.length ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {item.photo_paths.map((p, i) => (
            <Image key={p} source={photos.data?.[i] ? { uri: photos.data[i]! } : undefined} style={[styles.photo, { backgroundColor: c.surfaceMuted }]} contentFit="cover" accessibilityLabel={tr('日記的照片 {n}', { n: i + 1 })} />
          ))}
        </View>
      ) : null}
      {item.book ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <View style={{ flex: 1 }}>
            <BookLine book={item.book} color={color} />
          </View>
          {item.page_ref ? <AppText variant="caption" muted>{item.page_ref}</AppText> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.sm },
  undo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, minHeight: 44 },
  photo: { width: 96, height: 72, borderRadius: 10 },
});
