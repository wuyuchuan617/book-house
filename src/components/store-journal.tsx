import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { BookLine, VisibilityBadge } from '@/components/diary';
import { ActionSheet } from '@/components/sheet';
import { MoreButton, SwipeRow, swipeA11y, type SwipeAction } from '@/components/swipe-row';
import { AppText, Card } from '@/components/ui';
import { Radius, Spacing, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { useToggleSave } from '@/lib/browse';
import { categoryLabel, diaryError, useDeleteEntry, useDiaryImageUrls, useSavePlace, useSetJournalPublic, useStoreJournal, type JournalItem } from '@/lib/diary';
import { rxError, useRxAction, useRxWithdraw } from '@/lib/rx';
import { taipeiDate, taipeiToday } from '@/lib/period';
import { tr } from '@/lib/i18n';

type Filter = 'all' | 'want' | 'place' | 'post';

/**
 * 店主手記：想讀、想去、日記貼文依時間混在一起（v1.6：處方簽獨立成書店的「處方簽」分頁）。
 * mine（G2）：自己看全部，每一則標出書店頁看不看得到；每一則右邊「⋯」＋往左滑；讀者（G4）：只看公開的。
 */
export function StoreJournal({ bookstoreId, color, mine, scope = 'posts' }: { bookstoreId: string; color: StoreColor; mine?: boolean; scope?: 'posts' | 'want' | 'place' }) {
  const c = useTheme();
  const { data, isLoading, error, refetch } = useStoreJournal(bookstoreId);
  // v1.7.2：想讀、想去各自一個分頁
  const filter: Filter = scope === 'posts' ? 'post' : scope;
  const setPublic = useSetJournalPublic();
  const toggleSave = useToggleSave();
  const savePlace = useSavePlace();
  const delEntry = useDeleteEntry();
  const rxAction = useRxAction();
  const withdraw = useRxWithdraw();
  const [undo, setUndo] = useState<Extract<JournalItem, { type: 'want' | 'place' }> | null>(null);
  const [menuFor, setMenuFor] = useState<JournalItem | null>(null);
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
  // v1.7：手記只放日記貼文；v1.7.2：想讀、想去各一個分頁
  const items = data.filter((i) => i.type === filter);

  const toggle = (item: JournalItem) => {
    // v1.6：想讀、想去不再一則一則選，只看公開設定
    if (item.type !== 'post') {
      if (item.type === 'place' && !item.public_ok) return Alert.alert(tr('私人地點不會公開'), tr('住家等私人地點只會留在自己的書櫃裡。'));
      return Alert.alert(
        item.shown ? tr('讀者看得到') : tr('只有你看得到'),
        tr('想讀、想去要不要出現在書店頁，看「公開設定」。'),
        [
          { text: tr('好'), style: 'cancel' },
          { text: tr('公開設定'), onPress: () => router.push('/store-visibility') },
        ],
      );
    }
    const value = !item.is_public;
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
  const actionsFor = (item: JournalItem): (SwipeAction & { sub?: string })[] => {
    switch (item.type) {
      case 'want':
        return [
          { label: tr('編輯'), icon: 'edit-2', onPress: () => router.push({ pathname: '/want-book', params: { bookId: item.id, from: 'want' } }) },
          { label: tr('買了'), sub: tr('移到積讀，記在哪買'), icon: 'shopping-bag', onPress: () => router.push({ pathname: '/purchase', params: { bookId: item.id, from: 'want' } }) },
          { label: tr('移除'), sub: tr('6 秒內可以復原'), icon: 'trash-2', destructive: true, onPress: () => toggleSave.mutate({ bookId: item.id, save: false }, { onSuccess: () => setUndo(item), onError: fail }) },
        ];
      case 'place':
        return [
          {
            label: tr('編輯'),
            icon: 'edit-2',
            onPress: () =>
              router.push({ pathname: '/diary/compose', params: { kind: 'want', placeId: item.place.id, placeName: item.place.name, googlePlaceId: 'saved', publicOk: item.public_ok ? '1' : '0', saved: '1', note: item.note ?? '' } }),
          },
          { label: tr('移除'), sub: tr('6 秒內可以復原'), icon: 'trash-2', destructive: true, onPress: () => savePlace.mutate({ placeId: item.place.id, save: false }, { onSuccess: () => setUndo(item), onError: fail }) },
        ];
      case 'post': {
        const today = item.entry_date === taipeiToday();
        return [
          ...(today ? [{ label: tr('編輯'), sub: tr('只能改今天的日記'), icon: 'edit-2' as const, onPress: () => router.push({ pathname: '/diary/compose', params: { entryId: item.id } }) }] : []),
          ...(item.is_public
            ? [{ label: tr('改成只有自己'), sub: tr('從探索、地點頁和書店頁拿掉'), icon: 'lock' as const, onPress: () => setPublic.mutate({ item, value: false }, { onError: fail }) }]
            : today
              ? [{ label: tr('公開'), sub: tr('出現在書店頁和探索'), icon: 'globe' as const, onPress: () => toggle(item) }]
              : []),
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

  const heading = filter === 'want' ? tr('想讀 · {n}', { n: items.length }) : filter === 'place' ? tr('想去 · {n}', { n: items.length }) : tr('日記貼文 · {n}', { n: items.length });

  return (
    <View style={{ gap: Spacing.md }}>
      {items.length ? <AppText variant="label" style={{ fontSize: 15 }}>{heading}</AppText> : null}
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
        <View style={{ alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: mine ? 200 : 320, paddingHorizontal: Spacing.xl }}>
          <AppText variant="label">
            {filter === 'want' ? (mine ? tr('還沒有想讀的書') : tr('店主還沒有公開的想讀')) : filter === 'place' ? (mine ? tr('還沒有想去的地點') : tr('店主還沒有公開的想去')) : mine ? tr('還沒有日記貼文') : tr('店主還沒有公開的日記')}
          </AppText>
          <AppText variant="caption" muted style={{ textAlign: 'center' }}>
            {mine ? tr('按右下角的＋新增；要不要出現在書店頁，到 設定 › 公開設定。') : tr('店主公開之後會出現在這裡。')}
          </AppText>
        </View>
      ) : (
        items.map((item, index) => {
          const card = <JournalCard item={item} color={color} mine={mine} onToggle={() => toggle(item)} onMore={mine ? () => setMenuFor(item) : undefined} />;
          if (!mine) return <View key={`${item.type}-${item.id}`}>{card}</View>;
          const actions = actionsFor(item);
          return (
            <View key={`${item.type}-${item.id}`} style={{ borderRadius: Radius.xl, overflow: 'hidden' }} {...swipeA11y(actions)}>
              <SwipeRow actions={actions} background={c.background} hint={index === 0}>
                {card}
              </SwipeRow>
            </View>
          );
        })
      )}
      {mine && items.length ? (
        <AppText variant="caption" style={{ color: c.textTertiary }}>{tr('點「⋯」或往左滑可以編輯、移除。')}</AppText>
      ) : null}
      {mine ? (
        <ActionSheet
          visible={!!menuFor}
          onClose={() => setMenuFor(null)}
          badge={menuFor ? <KindTag item={menuFor} /> : undefined}
          title={menuFor ? journalTitle(menuFor) : undefined}
          actions={menuFor ? actionsFor(menuFor) : []}
        />
      ) : null}

    </View>
  );
}

const item_error = (m: string) => (/prescription|處方/.test(m) ? rxError(m) : diaryError(m));

function kindOf(item: JournalItem, c: ReturnType<typeof useTheme>) {
  return item.type === 'rx' || item.type === 'rx_reply' ? { label: item.type === 'rx' ? tr('發起處方簽') : tr('開了處方'), fg: '#5A4B8A', icon: 'message-circle' as const } : item.type === 'want' ? { label: tr('想讀'), fg: c.primary, icon: 'bookmark' as const } : item.type === 'place' ? { label: tr('想去'), fg: '#2F5D6B', icon: 'map-pin' as const } : item.book ? { label: tr('正在讀'), fg: c.success, icon: 'play' as const } : item.kind === 'checkin' ? { label: tr('打卡'), fg: '#5A4B8A', icon: 'map-pin' as const } : { label: tr('日記'), fg: '#5A4B8A', icon: 'edit-3' as const };
}

const journalTitle = (item: JournalItem) =>
  item.type === 'want' ? item.book.title : item.type === 'place' ? item.place.name : item.type === 'rx' ? item.title : item.type === 'rx_reply' ? item.book.title : (item.body ?? item.place?.name ?? item.place_label ?? item.book?.title ?? '');

function KindTag({ item }: { item: JournalItem }) {
  const c = useTheme();
  const kind = kindOf(item, c);
  return (
    <View style={[styles.tag, { backgroundColor: c.surface }]}>
      <AppText variant="caption" style={{ fontWeight: '700', color: kind.fg, fontSize: 11 }}>{kind.label}</AppText>
    </View>
  );
}

function JournalCard({ item, color, mine, onToggle, onMore }: { item: JournalItem; color: StoreColor; mine?: boolean; onToggle: () => void; onMore?: () => void }) {
  const c = useTheme();
  const kind = kindOf(item, c);
  const date = item.type === 'post' ? taipeiDate(`${item.entry_date}T04:00:00Z`).md : taipeiDate(item.at).md;

  return (
    <View style={[styles.card, { backgroundColor: c.surface }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Feather name={kind.icon} size={13} color={kind.fg} />
        <AppText variant="caption" style={{ fontWeight: '700', color: kind.fg }}>{kind.label}</AppText>
        <AppText variant="caption" muted style={{ flex: 1 }}>{`· ${date}`}</AppText>
        {mine ? (
          <Pressable accessibilityRole="button" accessibilityLabel={item.shown ? tr('讀者看得到') : tr('只有你看得到')} hitSlop={8} onPress={onToggle}>
            {item.shown ? <VisibilityBadge v={{ public: true, where: 'store' }} /> : <VisibilityBadge v={{ public: false }} />}
          </Pressable>
        ) : null}
        {onMore ? <MoreButton onPress={onMore} label={tr('{kind}的更多動作', { kind: kind.label })} /> : null}
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
  tag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
});
