import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { BookPicker, NoteForm } from '@/components/book-picker';
import { CurationActions } from '@/components/curation-actions';
import { TextField } from '@/components/form';
import { PublishDateSheet } from '@/components/publish-date-sheet';
import { SortableList } from '@/components/sortable-list';
import { SwipeRow, swipeA11y } from '@/components/swipe-row';
import { TagPicker } from '@/components/tag-picker';
import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  DESCRIPTION_MAX,
  friendlyError,
  sortedItems,
  TITLE_MAX,
  useAddItem,
  useCuration,
  useCurationStats,
  useMyCurations,
  usePublishCuration,
  useRemoveItem,
  useReorderItems,
  useSetTags,
  useUnpublishCuration,
  useUpdateCuration,
  useUpdateItemNote,
  type CurationItem,
} from '@/lib/curations';
import { currentPeriod, monthOf, periodLabel, periodRelative, taipeiDate, timeAgo } from '@/lib/period';
import { useMyStore } from '@/lib/queries';
import { tr } from '@/lib/i18n';

/**
 * C1／C2 新增策展、C6 編輯策展。
 * 草稿與預約中：自動存檔，下方「儲存」可以馬上存。已發布：改動先留在本機，按下方「儲存並更新」才送出。
 * 書架（加書、移除、排序、推薦理由）一律立即生效：點書直接寫推薦理由、往左滑編輯／移除、按住 ≡ 拖拉排序。
 * 發布時選上架日期（本月起 4 個月內，當月任一天）。
 */
export default function CurationEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const { data: cur, isLoading } = useCuration(id);
  const { data: store } = useMyStore();
  const { data: mine } = useMyCurations();

  const update = useUpdateCuration();
  const setTags = useSetTags();
  const addItem = useAddItem();
  const removeItem = useRemoveItem();
  const reorder = useReorderItems();
  const updateNote = useUpdateItemNote();
  const publish = usePublishCuration();
  const unpublish = useUnpublishCuration();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<CurationItem | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  // 載入後把伺服器的值放進表單（每檔只做一次，避免覆蓋正在打的字）
  useEffect(() => {
    if (cur && loadedFor.current !== cur.id) {
      loadedFor.current = cur.id;
      setTitle(cur.title ?? '');
      setDescription(cur.description ?? '');
      setSavedAt(cur.updated_at);
    }
  }, [cur]);

  const isPublished = cur?.status === 'published';
  const dirty = !!cur && (title.trim() !== (cur.title ?? '') || description.trim() !== (cur.description ?? ''));

  // 草稿／預約中：停止輸入 0.8 秒後自動存檔
  useEffect(() => {
    if (!cur || isPublished || !dirty) return;
    if (cur.status === 'scheduled' && !title.trim()) return; // 預約中不能把標題清空
    const t = setTimeout(() => {
      update.mutate(
        { id: cur.id, title, description },
        { onSuccess: () => setSavedAt(new Date().toISOString()) },
      );
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, cur?.id, cur?.status, isPublished]);

  // 已發布且有未儲存的變更：離開前確認
  const [allowLeave, setAllowLeave] = useState(false);
  usePreventRemove(isPublished && dirty && !allowLeave, ({ repeat }) => {
    Alert.alert(tr('捨棄未儲存的變更？'), tr('標題與說明的修改還沒有更新給讀者。'), [
      { text: tr('繼續編輯'), style: 'cancel' },
      { text: tr('捨棄'), style: 'destructive', onPress: repeat },
    ]);
  });

  const { data: stats } = useCurationStats(cur?.id, cur?.status === 'published');
  const items = useMemo(() => (cur ? sortedItems(cur) : []), [cur]);
  const pickedIds = useMemo(() => new Set(items.map((it) => it.books.id)), [items]);
  const tagIds = cur?.curation_tags.map((t) => t.tag_id) ?? [];

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!cur || !store) return <EmptyState title={tr('找不到這檔策展')} body={tr('它可能已經被刪除了。')} actionLabel={tr('回我的書店')} onAction={() => router.navigate('/my-store')} />;

  const color = store.store.color;
  const month = monthOf(cur.period);
  const isFuture = cur.period > currentPeriod();
  const isPast = cur.period < currentPeriod();
  const scheduledMd = cur.scheduled_for ? taipeiDate(cur.scheduled_for).md : `${month}/1`;
  const otherLiveSameMonth = mine?.some((m) => m.period === cur.period && m.status !== 'draft' && m.id !== cur.id);

  const missing: string[] = [];
  if (!title.trim()) missing.push(tr('取一個策展標題'));
  if (items.length === 0) missing.push(tr('放上至少 1 本書'));
  const canPublish = cur.status === 'draft' && missing.length === 0 && !isPast && !otherLiveSameMonth;
  const publishLabel = isFuture ? tr('選擇上架日期') : tr('發布策展');

  const banner = (() => {
    if (cur.status === 'published') return tr('已發布於 {month} 月。標題與說明按「儲存並更新」才會送出；書架的變更（加書、排序、理由）會立刻更新給讀者。', { month });
    if (cur.status === 'scheduled') return tr('已預約，{md} 早上 9 點上架。上架前都能修改，也能改日期。', { md: scheduledMd });
    if (isPast) return tr('這是 {month} 月的草稿，已經過了發布時間。可以從「⋯」複製成新的草稿接著用。', { month });
    if (otherLiveSameMonth) return tr('{month} 月已經有一檔發布中的策展。要發布這檔，請先取消發布那一檔。', { month });
    if (isFuture) return tr('這是 {month} 月策展。發布時選一天上架（台北時間早上 9 點），上架前都能修改。', { month });
    return tr('這是 {month} 月策展。可以今天就上架，或選這個月的其他日子。', { month });
  })();

  const move = (it: CurationItem, delta: -1 | 1 | 'top') => {
    const ids = items.map((x) => x.id);
    const i = ids.indexOf(it.id);
    if (delta === 'top') {
      if (i <= 0) return;
      ids.splice(i, 1);
      ids.unshift(it.id);
    } else {
      const j = i + delta;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    reorder.mutate({ curationId: cur.id, itemIds: ids }, { onError: (e) => Alert.alert(tr('排序沒有成功'), friendlyError(e.message)) });
  };

  const remove = (it: CurationItem) =>
    removeItem.mutate({ curationId: cur.id, itemId: it.id }, { onError: (e) => Alert.alert(tr('沒有移除成功'), friendlyError(e.message)) });

  const onPublish = async (publishOn: string) => {
    try {
      if (dirty) await update.mutateAsync({ id: cur.id, title, description });
      const res = await publish.mutateAsync({ id: cur.id, publishOn });
      setDateOpen(false);
      Alert.alert(
        res.status === 'scheduled' ? tr('已預約 {md} 上架', { md: res.scheduled_for ? taipeiDate(res.scheduled_for).md : '' }) : tr('策展發布了'),
        res.status === 'scheduled' ? tr('上架前都還能修改。') : tr('讀者現在可以在探索頁看到這檔策展。'),
      );
      if (cur.status === 'draft') router.back();
    } catch (e) {
      Alert.alert(tr('沒有發布成功'), friendlyError((e as Error).message));
    }
  };

  const onSave = () =>
    update.mutate(
      { id: cur.id, title, description },
      {
        onSuccess: () => setSavedAt(new Date().toISOString()),
        onError: (e) => Alert.alert(tr('沒有儲存成功'), friendlyError(e.message)),
      },
    );

  const discard = () => {
    setTitle(cur.title ?? '');
    setDescription(cur.description ?? '');
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: cur.status === 'draft' ? tr('新增策展') : tr('編輯策展'),
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={tr('更多操作')} onPress={() => setActionsOpen(true)} style={styles.headerBtn}>
              <Feather name="more-horizontal" size={22} color={c.text} />
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.xl, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <AppText variant="caption" muted accessibilityLiveRegion="polite">
            {isPublished
              ? dirty ? tr('● 有未儲存的變更') : tr('已發布 · 讀者看得到')
              : update.isPending ? tr('儲存中…') : dirty ? tr('● 有未儲存的變更') : savedAt ? tr('已儲存 · {p0}', { p0: timeAgo(savedAt) }) : tr('會自動存成草稿')}
          </AppText>
          {isPublished ? (
            <View style={[styles.statsRow, { backgroundColor: c.surface, borderColor: c.border }]}>
              <StatCell label={tr('拜訪')} value={stats?.visit_count} />
              <StatCell label={tr('讀者')} value={stats?.visitor_count} />
              <StatCell label={tr('收藏')} value={stats?.save_count} />
            </View>
          ) : null}

          <View style={{ gap: 6 }}>
            <AppText variant="label">{tr('策展月份')}</AppText>
            <AppText style={{ fontSize: 16, fontWeight: '600' }}>
              {periodLabel(cur.period)}
              <AppText muted>{periodRelative(cur.period) ? ` · ${periodRelative(cur.period)}` : ''}</AppText>
            </AppText>
            <View style={[styles.banner, { backgroundColor: c.surfaceMuted }]}>
              <AppText variant="caption">{banner}</AppText>
            </View>
          </View>

          <TextField label={tr('策展標題')} max={TITLE_MAX} value={title} onChangeText={setTitle} placeholder={tr('例如：冬天的星空指南')} />
          <TagPicker
            selected={tagIds}
            onChange={(ids) => setTags.mutate({ id: cur.id, tagIds: ids }, { onError: (e) => Alert.alert(tr('沒有成功'), friendlyError(e.message)) })}
          />
          <TextField
            label={tr('策展說明')}
            optional
            multiline
            max={DESCRIPTION_MAX}
            value={description}
            onChangeText={setDescription}
            placeholder={tr('這個月為什麼選這些書？讀完會有什麼感覺？')}
          />

          <View style={{ gap: Spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="label">{items.length ? tr('書架 · {length} 本', { length: items.length }) : tr('書架')}</AppText>
              <AppText variant="caption" muted>{items.length > 1 ? tr('按住 ≡ 拖拉排序 · 往左滑編輯') : tr('建議 3–7 本')}</AppText>
            </View>
            {items.length === 0 ? (
              <Pressable accessibilityRole="button" onPress={() => setPickerOpen(true)} style={[styles.empty, { borderColor: c.border }]}>
                <Feather name="plus" size={22} color={c.primary} />
                <AppText variant="label" style={{ color: c.primary }}>{tr('加入第一本書')}</AppText>
                <AppText variant="caption" muted>{tr('搜尋書名或作者')}</AppText>
              </Pressable>
            ) : (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <SortableList
                  items={items}
                  keyOf={(it) => it.id}
                  rowHeight={ROW_H}
                  onReorder={(ids) => reorder.mutate({ curationId: cur.id, itemIds: ids }, { onError: (e) => Alert.alert(tr('排序沒有成功'), friendlyError(e.message)) })}
                  renderRow={(it, i) => {
                    const lockLast = isPublished && items.length === 1;
                    const actions = [
                      { label: tr('推薦理由'), icon: 'edit-2' as const, onPress: () => setNoteFor(it) },
                      ...(lockLast ? [] : [{ label: tr('移除'), icon: 'trash-2' as const, destructive: true, onPress: () => remove(it) }]),
                    ];
                    const a11y = [
                      ...actions,
                      ...(i > 0 ? [{ label: tr('往前移'), onPress: () => move(it, -1) }] : []),
                      ...(i < items.length - 1 ? [{ label: tr('往後移'), onPress: () => move(it, 1) }] : []),
                    ];
                    return (
                      <SwipeRow actions={actions}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={tr('第 {p0} 本：{title}', { p0: i + 1, title: it.books.title })}
                          accessibilityHint={tr('點兩下寫推薦理由；其他動作在動作選單裡')}
                          {...swipeA11y(a11y)}
                          onPress={() => setNoteFor(it)}
                          style={[styles.item, { height: ROW_H }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
                          <BookCover title={it.books.title} url={it.books.cover_url} color={color} size="sm" />
                          <View style={{ flex: 1 }}>
                            <AppText variant="label" numberOfLines={1}>{it.books.title}</AppText>
                            {it.note ? (
                              <AppText variant="caption" muted numberOfLines={2}>{tr('理由：{note}', { note: it.note })}</AppText>
                            ) : (
                              <AppText variant="caption" style={{ color: c.primary }}>{tr('＋ 加上推薦理由')}</AppText>
                            )}
                          </View>
                          {justAdded === it.books.id ? (
                            <View style={[styles.badge, { backgroundColor: c.successSurface }]}>
                              <AppText variant="caption" style={{ color: c.success, fontWeight: '700' }}>{tr('剛加入')}</AppText>
                            </View>
                          ) : null}
                        </Pressable>
                      </SwipeRow>
                    );
                  }}
                />
              </Card>
            )}
            {items.length > 0 ? <Button kind="secondary" label={tr('再加一本書')} onPress={() => setPickerOpen(true)} /> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 底部動作列 */}
      <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        {cur.status === 'draft' ? (
          <>
            <AppText variant="caption" muted style={{ textAlign: 'center' }}>
              {isPast || otherLiveSameMonth
                ? tr('這檔目前不能發布')
                : missing.length
                  ? tr('還差 {length} 步：{p1}', { length: missing.length, p1: missing.join(tr('、')) })
                  : items.length < 3
                    ? tr('可以{p0}發布了，再加 {p1} 本會更完整', { p0: isFuture ? tr('預約') : '', p1: 3 - items.length })
                    : items.length <= 7
                      ? tr('很棒，{length} 本剛剛好，可以{p1}發布', { length: items.length, p1: isFuture ? tr('預約') : '' })
                      : tr('準備好了，可以{p0}發布', { p0: isFuture ? tr('預約') : '' })}
            </AppText>
            <View style={styles.footerRow}>
              <Button kind="secondary" label={tr('預覽')} style={{ flex: 1 }} onPress={() => router.push({ pathname: '/curation/preview/[id]', params: { id: cur.id } })} />
              <Button kind="secondary" label={update.isPending ? tr('儲存中…') : dirty ? tr('儲存') : tr('已儲存')} style={{ flex: 1 }} disabled={!dirty} onPress={onSave} />
              <Button label={publishLabel} style={{ flex: 2 }} disabled={!canPublish} loading={publish.isPending} onPress={() => setDateOpen(true)} />
            </View>
          </>
        ) : dirty ? (
          <View style={styles.footerRow}>
            <Button kind="secondary" label={tr('捨棄變更')} style={{ flex: 1 }} onPress={discard} />
            <Button label={isPublished ? tr('儲存並更新') : tr('儲存')} style={{ flex: 2 }} disabled={!title.trim()} loading={update.isPending} onPress={onSave} />
          </View>
        ) : cur.status === 'scheduled' ? (
          <>
            <AppText variant="caption" muted style={{ textAlign: 'center' }}>{tr('預約 {md} 早上 9 點上架', { md: scheduledMd })}</AppText>
            <View style={styles.footerRow}>
              <Button kind="secondary" label={tr('預覽')} style={{ flex: 1 }} onPress={() => router.push({ pathname: '/curation/preview/[id]', params: { id: cur.id } })} />
              <Button kind="secondary" label={tr('改日期')} style={{ flex: 1 }} onPress={() => setDateOpen(true)} />
              <Button kind="secondary" label={tr('取消預約')} style={{ flex: 1 }} loading={unpublish.isPending} onPress={() => unpublish.mutate(cur.id)} />
            </View>
          </>
        ) : (
          <Button kind="secondary" label={tr('以讀者身分預覽')} onPress={() => router.push({ pathname: '/curation/preview/[id]', params: { id: cur.id } })} />
        )}
      </SafeAreaView>

      <BookPicker
        visible={pickerOpen}
        mode="multi"
        askNote
        storeColor={color}
        pickedIds={pickedIds}
        shelfCount={items.length}
        onClose={() => setPickerOpen(false)}
        onAdd={async (book, note) => {
          await addItem.mutateAsync({ curationId: cur.id, bookId: book.id, note });
          setJustAdded(book.id);
        }}
      />

      <PublishDateSheet
        key={`${cur.id}-${dateOpen}`}
        visible={dateOpen}
        period={cur.period}
        initial={cur.scheduled_for ? taipeiDate(cur.scheduled_for).ymd : null}
        loading={publish.isPending}
        onClose={() => setDateOpen(false)}
        onConfirm={onPublish}
      />

      <Modal visible={!!noteFor} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setNoteFor(null)}>
        <Screen>
          <SafeAreaView style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
              <AppText variant="heading">{tr('推薦理由')}</AppText>
              {noteFor ? (
                <NoteForm
                  key={noteFor.id}
                  book={noteFor.books}
                  storeColor={color}
                  initial={noteFor.note ?? ''}
                  skipLabel={tr('取消')}
                  submitLabel={tr('儲存')}
                  saving={updateNote.isPending}
                  onSkip={() => setNoteFor(null)}
                  onSubmit={(note) =>
                    updateNote.mutate(
                      { curationId: cur.id, itemId: noteFor.id, note },
                      { onSuccess: () => setNoteFor(null), onError: (e) => Alert.alert(tr('沒有儲存成功'), friendlyError(e.message)) },
                    )
                  }
                />
              ) : null}
            </ScrollView>
          </SafeAreaView>
        </Screen>
      </Modal>

      <CurationActions
        curation={{ id: cur.id, title: cur.title, period: cur.period, status: cur.status, book_count: items.length }}
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        inEditor
        onDeleted={() => {
          setAllowLeave(true);
          setTimeout(() => router.back(), 0);
        }}
      />
    </Screen>
  );
}

const ROW_H = 84;

function StatCell({ label, value }: { label: string; value: number | undefined }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <AppText style={{ fontSize: 17, fontWeight: '700' }}>{value === undefined ? '–' : String(value)}</AppText>
      <AppText variant="caption" muted>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', borderWidth: 1, borderRadius: Radius.md, paddingVertical: Spacing.md },
  headerBtn: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center' },
  banner: { borderRadius: Radius.md, padding: Spacing.md },
  empty: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.lg, alignItems: 'center', paddingVertical: 28, gap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingLeft: Spacing.lg, paddingVertical: Spacing.sm },
  badge: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.sm },
  footerRow: { flexDirection: 'row', gap: Spacing.md, paddingBottom: Spacing.sm },
});
