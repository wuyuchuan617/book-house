import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { TextField } from '@/components/form';
import { ReadingActions } from '@/components/reading-actions';
import { ActionSheet } from '@/components/sheet';
import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { timeAgo } from '@/lib/period';
import { useMyStore } from '@/lib/queries';
import {
  NOTE_BODY_MAX,
  readingError,
  useAddNote,
  useDeleteNote,
  useDeleteReading,
  useMyReading,
  useUpdateNote,
  useUpdateReading,
  type MyReading,
} from '@/lib/readings';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
type Note = MyReading['reading_notes'][number];

/** R5 店主閱讀・編輯：狀態、公開、心得時間軸（新增／編輯／刪除） */
export default function ManageReadingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const { data: r, isLoading } = useMyReading(id);
  const { data: store } = useMyStore();
  const update = useUpdateReading();
  const addNote = useAddNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const delReading = useDeleteReading();
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [noteMenu, setNoteMenu] = useState<Note | null>(null);
  const [editing, setEditing] = useState<{ note: Note; body: string } | null>(null);

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!r || !store) return <EmptyState title="找不到這筆閱讀紀錄" body="它可能已經被移除了。" />;
  const fail = (e: Error) => Alert.alert('沒有成功', readingError(e.message));

  const removeReading = () =>
    Alert.alert(`從店主閱讀移除「${r.books.title}」？`, `${r.reading_notes.length} 則心得會一起刪除，無法復原。`, [
      { text: '取消', style: 'cancel' },
      { text: '移除', style: 'destructive', onPress: () => delReading.mutate(r.id, { onSuccess: () => router.back(), onError: fail }) },
    ]);

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: '店主閱讀',
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="更多操作" onPress={() => setMenuOpen(true)} style={styles.headerBtn}>
              <Feather name="more-horizontal" size={22} color={c.text} />
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
          <AppText variant="caption" muted>
            {r.status === 'reading' ? `在讀 · 從 ${md(r.started_at)} 開始` : `讀完${r.finished_at ? ` · ${md(r.finished_at)}` : ''}`}
          </AppText>
          <View style={{ flexDirection: 'row', gap: Spacing.lg }}>
            <BookCover title={r.books.title} url={r.books.cover_url} color={store.store.color} size="lg" />
            <View style={{ flex: 1, justifyContent: 'center', gap: 4 }}>
              <AppText variant="heading">{r.books.title}</AppText>
              <AppText muted>{r.books.authors.join('、')}</AppText>
            </View>
          </View>
          <Button
            kind={r.status === 'reading' ? 'primary' : 'secondary'}
            label={r.status === 'reading' ? '標記為讀完' : '改回正在讀'}
            loading={update.isPending}
            onPress={() => update.mutate({ id: r.id, status: r.status === 'reading' ? 'finished' : 'reading' }, { onError: fail })}
          />

          <View style={[styles.switchRow, { backgroundColor: c.surface }]}>
            <View style={{ flex: 1 }}>
              <AppText variant="label">公開在書店頁</AppText>
              <AppText variant="caption" muted>{r.is_public ? '讀者可以在「店主閱讀」看到' : '只有自己看得到'}</AppText>
            </View>
            <Switch accessibilityLabel="公開在書店頁" value={r.is_public} onValueChange={(v) => update.mutate({ id: r.id, is_public: v }, { onError: fail })} />
          </View>

          <AppText variant="label">{`心得 · ${r.reading_notes.length} 則`}</AppText>
          <View style={{ gap: Spacing.sm }}>
            <TextField label="新增心得" multiline max={NOTE_BODY_MAX} value={draft} onChangeText={setDraft} placeholder="讀到哪、想到什麼？" />
            <Button
              label="新增"
              disabled={!draft.trim()}
              loading={addNote.isPending}
              onPress={() => addNote.mutate({ readingId: r.id, body: draft }, { onSuccess: () => setDraft(''), onError: fail })}
            />
          </View>

          {r.reading_notes.length ? (
            <Card style={{ gap: Spacing.lg }}>
              {r.reading_notes.map((n, i) => (
                <Pressable key={n.id} accessibilityRole="button" accessibilityHint="編輯或刪除這則心得" onPress={() => setNoteMenu(n)} style={{ flexDirection: 'row', gap: Spacing.md }}>
                  <View style={[styles.dot, { backgroundColor: i === 0 ? c.primary : c.border }]} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" muted>{i === 0 ? timeAgo(n.created_at) : md(n.created_at)}</AppText>
                    <AppText style={{ marginTop: 2, lineHeight: 23 }}>{n.body}</AppText>
                  </View>
                  <Feather name="more-vertical" size={16} color={c.textTertiary} />
                </Pressable>
              ))}
            </Card>
          ) : (
            <AppText variant="caption" muted>還沒有心得。一則一則慢慢累積，讀者會看到你的閱讀時間軸。</AppText>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ReadingActions reading={r} visible={menuOpen} onClose={() => setMenuOpen(false)} onRemove={removeReading} inDetail />
      <ActionSheet
        visible={!!noteMenu}
        title="這則心得"
        subtitle={noteMenu ? noteMenu.body.slice(0, 30) : undefined}
        onClose={() => setNoteMenu(null)}
        actions={
          noteMenu
            ? [
                { label: '編輯', onPress: () => setEditing({ note: noteMenu, body: noteMenu.body }) },
                {
                  label: '刪除',
                  destructive: true,
                  onPress: () =>
                    Alert.alert('刪除這則心得？', '刪除後無法復原。', [
                      { text: '取消', style: 'cancel' },
                      { text: '刪除', style: 'destructive', onPress: () => deleteNote.mutate(noteMenu.id, { onError: fail }) },
                    ]),
                },
              ]
            : []
        }
      />
      <Modal visible={!!editing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
        <Screen>
          <SafeAreaView style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
              <AppText variant="heading">編輯心得</AppText>
              {editing ? (
                <>
                  <TextField label="心得" multiline max={NOTE_BODY_MAX} value={editing.body} onChangeText={(body) => setEditing({ ...editing, body })} autoFocus />
                  <View style={{ flexDirection: 'row', gap: Spacing.md }}>
                    <Button kind="secondary" label="取消" style={{ flex: 1 }} onPress={() => setEditing(null)} />
                    <Button
                      label="儲存"
                      style={{ flex: 2 }}
                      disabled={!editing.body.trim()}
                      loading={updateNote.isPending}
                      onPress={() => updateNote.mutate({ id: editing.note.id, body: editing.body }, { onSuccess: () => setEditing(null), onError: fail })}
                    />
                  </View>
                </>
              ) : null}
            </ScrollView>
          </SafeAreaView>
        </Screen>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBtn: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
});
