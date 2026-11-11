import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { Chip, Toggle } from '@/components/form';
import { kindLabel, NOTE_KINDS, NoteTimeline } from '@/components/note-card';
import { ReadingActions } from '@/components/reading-actions';
import { AppText, Button, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NoteKind, ReadingNote } from '@/lib/browse';
import { tr } from '@/lib/i18n';
import { useMyStore } from '@/lib/queries';
import { confirmDeleteNote, readingError, useDeleteNote, useDeleteReading, useMyReading, useUpdateReading } from '@/lib/readings';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/**
 * R5 這本書（店主）：書的資訊、狀態、公開；下面是心得列表（可依類型篩選）。
 * 寫心得另開一頁（R8），點一則心得看詳情（R10），往左滑編輯／刪除。
 */
export default function ReadingBookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const { data: r, isLoading } = useMyReading(id);
  const { data: store } = useMyStore();
  const update = useUpdateReading();
  const deleteNote = useDeleteNote();
  const delReading = useDeleteReading();
  const [menuOpen, setMenuOpen] = useState(false);
  const [filter, setFilter] = useState<NoteKind | 'all'>('all');

  const notes = useMemo(() => r?.reading_notes ?? [], [r]);
  const counts = useMemo(() => {
    const m: Record<NoteKind, number> = { quote: 0, reflection: 0, thought: 0 };
    notes.forEach((n) => (m[n.kind] += 1));
    return m;
  }, [notes]);

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!r || !store) return <EmptyState title={tr('找不到這筆閱讀紀錄')} body={tr('它可能已經被移除了。')} />;
  const fail = (e: Error) => Alert.alert(tr('沒有成功'), readingError(e.message));
  const shown = filter === 'all' ? notes : notes.filter((n) => n.kind === filter);

  const removeReading = () =>
    Alert.alert(tr('從店主閱讀移除「{title}」？', { title: r.books.title }), tr('{length} 則心得會一起刪除，無法復原。', { length: notes.length }), [
      { text: tr('取消'), style: 'cancel' },
      { text: tr('移除'), style: 'destructive', onPress: () => delReading.mutate(r.id, { onSuccess: () => router.back(), onError: fail }) },
    ]);

  const confirmDelete = (n: ReadingNote) =>
    void confirmDeleteNote(n.id, (withPost) => deleteNote.mutate({ id: n.id, photoPaths: n.photo_paths, withPost }, { onError: fail }));

  const compose = (noteId?: string) => router.push({ pathname: '/reading/compose', params: noteId ? { readingId: r.id, noteId } : { readingId: r.id } });

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: tr('這本書'),
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={tr('更多操作')} onPress={() => setMenuOpen(true)} style={styles.headerBtn}>
              <Feather name="more-horizontal" size={22} color={c.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md, paddingBottom: 32 }}>
        <View style={[styles.book, { backgroundColor: c.surface }]}>
          <BookCover title={r.books.title} url={r.books.cover_url} color={store.store.color} size="lg" />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="heading">{r.books.title}</AppText>
            <AppText variant="caption" muted>{r.books.authors.join(tr('、'))}</AppText>
            <AppText variant="caption" style={{ color: c.success, fontWeight: '700', marginTop: 4 }}>
              {r.status === 'reading' ? tr('在讀 · 從 {p0} 開始', { p0: md(r.started_at) }) : tr('讀完{p0}', { p0: r.finished_at ? ` · ${md(r.finished_at)}` : '' })}
            </AppText>
            <AppText variant="caption" muted>
              {tr('{n} 則 · 摘句 {q} · 心得 {r} · 想法 {t}', { n: notes.length, q: counts.quote, r: counts.reflection, t: counts.thought })}
            </AppText>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <Button
            kind="secondary"
            style={{ flex: 1 }}
            label={r.status === 'reading' ? tr('標記為讀完') : tr('改回正在讀')}
            loading={update.isPending}
            onPress={() => update.mutate({ id: r.id, status: r.status === 'reading' ? 'finished' : 'reading' }, { onError: fail })}
          />
        </View>
        <View style={[styles.switchRow, { backgroundColor: c.surface }]}>
          <View style={{ flex: 1 }}>
            <AppText variant="label">{tr('公開在書店頁')}</AppText>
            <AppText variant="caption" muted>{r.is_public ? tr('讀者看得到這本書與所有心得、圖片') : tr('只有自己看得到')}</AppText>
          </View>
          <Toggle accessibilityLabel={tr('公開在書店頁')} value={r.is_public} onValueChange={(v) => update.mutate({ id: r.id, is_public: v }, { onError: fail })} />
        </View>

        {notes.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm }}>
            <Chip label={tr('全部 {n}', { n: notes.length })} selected={filter === 'all'} onPress={() => setFilter('all')} />
            {NOTE_KINDS.map((k) => (counts[k] ? <Chip key={k} label={`${kindLabel(k)} ${counts[k]}`} selected={filter === k} onPress={() => setFilter(k)} /> : null))}
          </View>
        ) : null}

        {shown.length ? (
          <NoteTimeline
            notes={shown}
            startedAt={filter === 'all' ? r.started_at : null}
            highlightLatest={filter === 'all'}
            photoSize={80}
            onPressNote={(n) => router.push({ pathname: '/reading/note/[id]', params: { id: n.id, readingId: r.id } })}
            actionsFor={(n) => [
              { label: tr('編輯'), icon: 'edit-2', onPress: () => compose(n.id) },
              { label: tr('刪除'), icon: 'trash-2', destructive: true, onPress: () => confirmDelete(n) },
            ]}
          />
        ) : null}
        {!notes.length ? (
          <View style={[styles.empty, { borderColor: c.border }]}>
            <AppText variant="label">{tr('還沒有心得')}</AppText>
            <AppText variant="caption" muted style={{ textAlign: 'center' }}>{tr('抄一句喜歡的句子、寫下想法，或掃描書頁把文字節錄下來。')}</AppText>
          </View>
        ) : null}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Button label={tr('＋ 寫心得')} onPress={() => compose()} />
      </SafeAreaView>

      <ReadingActions reading={r} visible={menuOpen} onClose={() => setMenuOpen(false)} onRemove={removeReading} inDetail />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBtn: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center' },
  book: { flexDirection: 'row', gap: Spacing.lg, borderRadius: Radius.lg, padding: Spacing.lg },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg },
  empty: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.lg, alignItems: 'center', padding: Spacing.xl, gap: 6 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
});
