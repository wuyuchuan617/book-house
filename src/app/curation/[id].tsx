import Feather from '@expo/vector-icons/Feather';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { BookPicker, NoteForm } from '@/components/book-picker';
import { CurationActions } from '@/components/curation-actions';
import { TextField } from '@/components/form';
import { PublishDateSheet } from '@/components/publish-date-sheet';
import { ActionSheet } from '@/components/sheet';
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
  type Book,
  type Curation,
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
} from '@/lib/curations';
import { currentPeriod, monthOf, periodLabel, periodRelative, taipeiDate, timeAgo } from '@/lib/period';
import { useMyStore } from '@/lib/queries';
import { tr } from '@/lib/i18n';

/** 這一頁上的書架（還沒送出）：id 是伺服器上的 item id，新加的書是 null */
type DraftItem = { id: string | null; book: Book; note: string };
type Draft = { title: string; description: string; tags: string[]; items: DraftItem[] };

const draftOf = (cur: Curation): Draft => ({
  title: cur.title ?? '',
  description: cur.description ?? '',
  tags: cur.curation_tags.map((t) => t.tag_id),
  items: sortedItems(cur).map((it) => ({ id: it.id, book: it.books, note: it.note ?? '' })),
});

/** 跟伺服器比，有幾個變更（標題、說明、標籤、書架順序各算一個；每本加入／移除／改理由各算一個） */
function countChanges(cur: Curation, d: Draft) {
  const base = draftOf(cur);
  let n = 0;
  if (d.title.trim() !== base.title) n++;
  if (d.description.trim() !== base.description) n++;
  if ([...d.tags].sort().join() !== [...base.tags].sort().join()) n++;
  const baseById = new Map(base.items.map((it) => [it.id, it]));
  const keep = new Set(d.items.map((it) => it.id).filter(Boolean));
  n += d.items.filter((it) => !it.id).length;
  n += base.items.filter((it) => !keep.has(it.id)).length;
  n += d.items.filter((it) => it.id && baseById.get(it.id)!.note !== it.note.trim()).length;
  const order = d.items.filter((it) => it.id).map((it) => it.id).join();
  const baseOrder = base.items.filter((it) => keep.has(it.id)).map((it) => it.id).join();
  if (order !== baseOrder) n++;
  return n;
}

/**
 * C1／C2 新增策展、C6 編輯策展。
 * v1.7.1 Z2（全 App 統一）：改內容都先留在這一頁，按「儲存」（草稿／預約中）或「儲存並更新」（已發布）才一次送出——
 * 標題、說明、標籤、加書、移除、排序、推薦理由都一樣。上面一條黃色提示還有幾個變更沒送；改過沒存按返回會問。
 * 發布時先存再發布；選上架日期（本月起 4 個月內，當月任一天）。
 */
export default function CurationEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const { data: cur, isLoading } = useCuration(id);
  const { data: store } = useMyStore();
  const { data: mine } = useMyCurations();

  const qc = useQueryClient();
  const update = useUpdateCuration();
  const setTags = useSetTags();
  const addItem = useAddItem();
  const removeItem = useRemoveItem();
  const reorder = useReorderItems();
  const updateNote = useUpdateItemNote();
  const publish = usePublishCuration();
  const unpublish = useUnpublishCuration();

  const [draft, setDraft] = useState<Draft>({ title: '', description: '', tags: [], items: [] });
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<DraftItem | null>(null);
  const [reasonsOpen, setReasonsOpen] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  // 載入後把伺服器的值放進這一頁（每檔只做一次；存完會重新放一次）
  useEffect(() => {
    if (cur && loadedFor.current !== cur.id) {
      loadedFor.current = cur.id;
      setDraft(draftOf(cur));
    }
  }, [cur]);

  const isPublished = cur?.status === 'published';
  const changes = cur ? countChanges(cur, draft) : 0;
  const dirty = changes > 0;
  const { title, description } = draft;
  const setTitle = (t: string) => setDraft((d) => ({ ...d, title: t }));
  const setDescription = (t: string) => setDraft((d) => ({ ...d, description: t }));

  // 改過沒存：離開前確認
  const [allowLeave, setAllowLeave] = useState(false);
  usePreventRemove(dirty && !allowLeave, ({ repeat }) => {
    Alert.alert(tr('放棄這次的修改？'), tr('還沒儲存的內容會不見。'), [
      { text: tr('繼續編輯'), style: 'cancel' },
      { text: tr('放棄'), style: 'destructive', onPress: repeat },
    ]);
  });

  const { data: stats } = useCurationStats(cur?.id, cur?.status === 'published');
  const items = draft.items;
  const pickedIds = useMemo(() => new Set(items.map((it) => it.book.id)), [items]);
  const tagIds = draft.tags;

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
  // v1.7 Y9：加書時理由可以先空著；發布前每本都要有
  const noteless = items.filter((it) => !it.note.trim());
  if (noteless.length) missing.push(tr('{n} 本書寫推薦理由', { n: noteless.length }));
  const canPublish = cur.status === 'draft' && !!title.trim() && items.length > 0 && !isPast && !otherLiveSameMonth;
  const publishLabel = isFuture ? tr('選擇上架日期') : tr('發布策展');

  const banner = (() => {
    if (cur.status === 'published') return tr('已發布於 {month} 月。改了什麼都要按「儲存並更新」才會送給讀者。', { month });
    if (cur.status === 'scheduled') return tr('已預約，{md} 早上 9 點上架。上架前都能修改，也能改日期。', { md: scheduledMd });
    if (isPast) return tr('這是 {month} 月的草稿，已經過了發布時間。可以從「⋯」複製成新的草稿接著用。', { month });
    if (otherLiveSameMonth) return tr('{month} 月已經有一檔發布中的策展。要發布這檔，請先取消發布那一檔。', { month });
    if (isFuture) return tr('這是 {month} 月策展。發布時選一天上架（台北時間早上 9 點），上架前都能修改。', { month });
    return tr('這是 {month} 月策展。可以今天就上架，或選這個月的其他日子。', { month });
  })();

  const keyOf = (it: DraftItem) => it.book.id;
  const setItems = (fn: (list: DraftItem[]) => DraftItem[]) => setDraft((d) => ({ ...d, items: fn(d.items) }));
  const move = (it: DraftItem, delta: -1 | 1) =>
    setItems((list) => {
      const next = [...list];
      const i = next.findIndex((x) => keyOf(x) === keyOf(it));
      const j = i + delta;
      if (i < 0 || j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const remove = (it: DraftItem) => setItems((list) => list.filter((x) => keyOf(x) !== keyOf(it)));

  /** 一次送出：標題說明 → 新加的書 → 改理由 → 移除（先加後刪，已發布的不會空掉）→ 排序 → 標籤 */
  const saveAll = async () => {
    const base = draftOf(cur);
    if (draft.title.trim() !== base.title || draft.description.trim() !== base.description) {
      await update.mutateAsync({ id: cur.id, title: draft.title, description: draft.description });
    }
    const ids: string[] = [];
    for (const it of draft.items) {
      if (it.id) {
        ids.push(it.id);
        const was = base.items.find((b) => b.id === it.id);
        if (was && was.note !== it.note.trim()) await updateNote.mutateAsync({ curationId: cur.id, itemId: it.id, note: it.note });
      } else {
        const added = await addItem.mutateAsync({ curationId: cur.id, bookId: it.book.id, note: it.note.trim() || null });
        ids.push(added.id);
      }
    }
    const keep = new Set(ids);
    for (const b of base.items) if (b.id && !keep.has(b.id)) await removeItem.mutateAsync({ curationId: cur.id, itemId: b.id });
    if (ids.join() !== base.items.filter((b) => keep.has(b.id!)).map((b) => b.id).join() || draft.items.some((it) => !it.id)) {
      await reorder.mutateAsync({ curationId: cur.id, itemIds: ids });
    }
    if ([...draft.tags].sort().join() !== [...base.tags].sort().join()) await setTags.mutateAsync({ id: cur.id, tagIds: draft.tags });
    const fresh = await qc.fetchQuery<Curation | null>({ queryKey: ['curation', cur.id], staleTime: 0 });
    if (fresh) setDraft(draftOf(fresh));
    setJustAdded(null);
  };

  const onPublish = async (publishOn: string) => {
    try {
      if (dirty) await saveAll();
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

  const onSave = async () => {
    setSaving(true);
    try {
      await saveAll();
    } catch (e) {
      Alert.alert(tr('沒有儲存成功'), friendlyError((e as Error).message));
      // 送出一半失敗：重新拿伺服器的狀態，留在這一頁的變更不動
      void qc.invalidateQueries({ queryKey: ['curation', cur.id] });
    } finally {
      setSaving(false);
    }
  };

  const discard = () => setDraft(draftOf(cur));

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
          {dirty ? (
            <View style={[styles.pending, { backgroundColor: '#FBF1DC' }]} accessibilityLiveRegion="polite">
              <Feather name="alert-circle" size={15} color="#8A5A12" />
              <AppText variant="caption" style={{ flex: 1, color: '#8A5A12' }}>
                {isPublished ? tr('有 {n} 個變更還沒送出，讀者看到的還是舊的', { n: changes }) : tr('有 {n} 個變更還沒儲存', { n: changes })}
              </AppText>
            </View>
          ) : (
            <AppText variant="caption" muted accessibilityLiveRegion="polite">
              {isPublished ? tr('已發布 · 讀者看得到') : tr('已儲存 · {p0}', { p0: timeAgo(cur.updated_at) })}
            </AppText>
          )}
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
          <TagPicker selected={tagIds} onChange={(ids) => setDraft((d) => ({ ...d, tags: ids }))} />
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
            {items.length ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }} accessible accessibilityLabel={tr('推薦理由 {a}/{b}', { a: items.length - noteless.length, b: items.length })}>
                <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.surfaceMuted }}>
                  <View style={{ width: `${((items.length - noteless.length) / items.length) * 100}%`, height: 6, borderRadius: 3, backgroundColor: c.success }} />
                </View>
                <AppText variant="caption" muted>{tr('推薦理由 {a}/{b}', { a: items.length - noteless.length, b: items.length })}</AppText>
              </View>
            ) : null}
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
                  keyOf={keyOf}
                  rowHeight={ROW_H}
                  onReorder={(keys) => setItems((list) => keys.map((k) => list.find((x) => keyOf(x) === k)!).filter(Boolean))}
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
                          accessibilityLabel={tr('第 {p0} 本：{title}', { p0: i + 1, title: it.book.title })}
                          accessibilityHint={tr('點兩下寫推薦理由；其他動作在動作選單裡')}
                          {...swipeA11y(a11y)}
                          onPress={() => setNoteFor(it)}
                          style={[styles.item, { height: ROW_H }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
                          <BookCover title={it.book.title} url={it.book.cover_url} color={color} size="sm" />
                          <View style={{ flex: 1 }}>
                            <AppText variant="label" numberOfLines={1}>{it.book.title}</AppText>
                            {it.note.trim() ? (
                              <AppText variant="caption" muted numberOfLines={2}>{tr('理由：{note}', { note: it.note })}</AppText>
                            ) : (
                              <AppText variant="caption" style={{ color: c.danger, fontWeight: '700' }}>{tr('＋ 寫推薦理由（發布前要寫）')}</AppText>
                            )}
                          </View>
                          {justAdded === it.book.id || !it.id ? (
                            <View style={[styles.badge, { backgroundColor: c.successSurface }]}>
                              <AppText variant="caption" style={{ color: c.success, fontWeight: '700' }}>{tr('新加入')}</AppText>
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
              <Button kind="secondary" label={saving ? tr('儲存中…') : dirty ? tr('儲存') : tr('已儲存')} style={{ flex: 1 }} disabled={!dirty || saving} onPress={() => void onSave()} />
              <Button label={publishLabel} style={{ flex: 2 }} disabled={!canPublish || saving} loading={publish.isPending} onPress={() => (noteless.length ? setReasonsOpen(true) : setDateOpen(true))} />
            </View>
          </>
        ) : dirty ? (
          <View style={styles.footerRow}>
            <Button kind="secondary" label={tr('捨棄變更')} style={{ flex: 1 }} onPress={discard} />
            <Button label={isPublished ? tr('儲存並更新') : tr('儲存')} style={{ flex: 2 }} disabled={!title.trim() || (isPublished && items.length === 0)} loading={saving} onPress={() => void onSave()} />
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
          setItems((list) => (list.some((x) => x.book.id === book.id) ? list : [...list, { id: null, book, note: note ?? '' }]));
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

      <ActionSheet
        visible={reasonsOpen}
        onClose={() => setReasonsOpen(false)}
        title={tr('還有 {n} 本沒寫推薦理由', { n: noteless.length })}
        subtitle={tr('每本書都寫好理由才能發布')}
        actions={noteless.map((it) => ({ label: it.book.title, sub: tr('寫推薦理由'), icon: 'edit-2' as const, onPress: () => setNoteFor(it) }))}
      />
      <Modal visible={!!noteFor} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setNoteFor(null)}>
        <Screen>
          <SafeAreaView style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
              <AppText variant="heading">{tr('推薦理由')}</AppText>
              {noteFor ? (
                <NoteForm
                  key={keyOf(noteFor)}
                  book={noteFor.book}
                  storeColor={color}
                  initial={noteFor.note}
                  skipLabel={tr('取消')}
                  submitLabel={tr('好了')}
                  onSkip={() => setNoteFor(null)}
                  onSubmit={(note) => {
                    const key = keyOf(noteFor);
                    setItems((list) => list.map((x) => (keyOf(x) === key ? { ...x, note: note ?? '' } : x)));
                    setNoteFor(null);
                  }}
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
  pending: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10 },
  badge: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.sm },
  footerRow: { flexDirection: 'row', gap: Spacing.md, paddingBottom: Spacing.sm },
});
