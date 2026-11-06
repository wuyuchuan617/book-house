import Feather from '@expo/vector-icons/Feather';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { Chip, chipRow, TextField } from '@/components/form';
import { AppText, Button, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError, NOTE_MAX, useBookSearch, useCreateManualBook, type Book } from '@/lib/curations';

/** 輸入停一下才查詢，避免每打一個字就打一次 API */
function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const bookMeta = (b: Pick<Book, 'authors' | 'published_year'>) =>
  [b.authors.join('、'), b.published_year].filter(Boolean).join(' · ');

// ---------------------------------------------------------------------------
// 搜尋面板：O4 直接嵌在頁面裡，C3 放在 BookPicker 彈出面板裡
// ---------------------------------------------------------------------------
export function BookSearchPanel({ storeColor, mode, isPicked, onPick, onManual, busyId, autoFocus, header, suggestions }: {
  storeColor: StoreColor;
  mode: 'multi' | 'single';
  isPicked: (book: Book) => boolean;
  onPick: (book: Book) => void;
  onManual: (query: string) => void;
  busyId?: string | null;
  autoFocus?: boolean;
  header?: React.ReactNode;
  /** 還沒輸入時的快速選項（R3「最近在你的策展裡」） */
  suggestions?: { label: string; books: Book[] };
}) {
  const c = useTheme();
  const [query, setQuery] = useState('');
  const q = useDebounced(query);
  const { data, isFetching, error, refetch } = useBookSearch(q);
  const tooShort = [...q.trim()].length < 2;
  const pickedCount = data?.filter(isPicked).length ?? 0;

  const renderRow = (b: Book) => {
    const picked = isPicked(b);
    const label = picked ? (mode === 'multi' ? '已加入' : '已在閱讀中') : mode === 'multi' ? '加入' : '選這本';
    return (
      <View key={b.id} style={[styles.row, { borderBottomColor: c.divider }]}>
        <BookCover title={b.title} url={b.cover_url} color={storeColor} size="sm" />
        <View style={{ flex: 1 }}>
          <AppText variant="label" numberOfLines={2}>{b.title}</AppText>
          <AppText variant="caption" muted numberOfLines={1}>{bookMeta(b)}</AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}：${b.title}`}
          accessibilityState={{ disabled: picked }}
          disabled={picked || busyId === b.id}
          onPress={() => onPick(b)}
          style={[
            styles.pick,
            picked ? { backgroundColor: c.successSurface } : { backgroundColor: c.background, borderColor: c.border, borderWidth: 1 },
          ]}>
          {busyId === b.id ? (
            <ActivityIndicator />
          ) : (
            <AppText variant="caption" style={{ fontWeight: '700', color: picked ? c.success : c.primary }}>{picked ? `✓ ${label}` : label}</AppText>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <View style={{ gap: Spacing.md }}>
      {header}
      <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Feather name="search" size={18} color={c.textSecondary} />
        <TextInput
          accessibilityLabel="搜尋書名或作者"
          placeholder="搜尋書名或作者"
          placeholderTextColor={c.textTertiary}
          value={query}
          onChangeText={setQuery}
          autoFocus={autoFocus}
          returnKeyType="search"
          style={[styles.searchInput, { color: c.text }]}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="清除搜尋" onPress={() => setQuery('')} style={styles.clear}>
            <Feather name="x-circle" size={18} color={c.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      {tooShort ? (
        <>
          <AppText variant="caption" muted>輸入 2 個字以上開始搜尋</AppText>
          {suggestions?.books.length ? (
            <>
              <AppText variant="label" style={{ marginTop: Spacing.sm }}>{suggestions.label}</AppText>
              {suggestions.books.map(renderRow)}
            </>
          ) : null}
        </>
      ) : isFetching && !data ? (
        <ActivityIndicator style={{ marginVertical: Spacing.lg }} />
      ) : error ? (
        <View style={{ gap: Spacing.sm }}>
          <AppText variant="caption" muted>{`搜尋沒有成功：${friendlyError(error.message)}`}</AppText>
          <Button kind="secondary" label="再試一次" onPress={() => refetch()} />
        </View>
      ) : (
        <>
          <AppText variant="caption" muted accessibilityLiveRegion="polite">
            {data?.length
              ? `找到 ${data.length} 本${pickedCount ? ` · ${mode === 'multi' ? '書架上已有' : '已在閱讀中'} ${pickedCount} 本` : ''}`
              : '沒有找到符合的書'}
          </AppText>
          {data?.map(renderRow)}
        </>
      )}

      {!tooShort ? (
        <Button kind="link" label={`找不到？手動新增「${q.trim()}」`} onPress={() => onManual(q.trim())} />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// C4 手動新增書籍：只要書名＋作者
// ---------------------------------------------------------------------------
export function ManualBookForm({ initialTitle, storeColor, submitLabel = '加入書架', onCreated }: {
  initialTitle: string;
  storeColor: StoreColor;
  submitLabel?: string;
  onCreated: (book: Book) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState('');
  const create = useCreateManualBook();
  const ok = title.trim().length > 0 && author.trim().length > 0;

  return (
    <View style={{ gap: Spacing.lg }}>
      <AppText muted>找不到這本書？填書名和作者就能加入書架。</AppText>
      <TextField label="書名" value={title} onChangeText={setTitle} max={200} autoFocus />
      <TextField label="作者" value={author} onChangeText={setAuthor} max={100} returnKeyType="done" />
      <View style={{ flexDirection: 'row', gap: Spacing.md, alignItems: 'center' }}>
        <BookCover title={title || '書名'} color={storeColor} size="lg" />
        <View style={{ flex: 1 }}>
          <AppText variant="label">自動產生的封面</AppText>
          <AppText variant="caption" muted>用你的店面顏色＋書名</AppText>
        </View>
      </View>
      <Button
        label={submitLabel}
        disabled={!ok}
        loading={create.isPending}
        onPress={() =>
          create.mutate(
            { title, author },
            { onSuccess: onCreated, onError: (e) => Alert.alert('沒有新增成功', friendlyError(e.message)) },
          )
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// C5／O7：推薦理由（選填，最多 120 字）
// ---------------------------------------------------------------------------
export const NOTE_PROMPTS = ['適合誰讀', '最難忘的一段', '跟上一本的關係', '讀完我做了什麼'];

export function NoteForm({ book, storeColor, caption, prompts = NOTE_PROMPTS, initial = '', skipLabel = '先略過', submitLabel = '加入書架', saving, onSkip, onSubmit }: {
  book: Book;
  storeColor: StoreColor;
  caption?: string;
  prompts?: string[];
  initial?: string;
  skipLabel?: string;
  submitLabel?: string;
  saving?: boolean;
  onSkip: () => void;
  onSubmit: (note: string) => void;
}) {
  // 換書時請由呼叫端給不同的 key，表單會重新開始
  const [note, setNote] = useState(initial);

  return (
    <View style={{ gap: Spacing.lg }}>
      <View style={{ flexDirection: 'row', gap: Spacing.md }}>
        <BookCover title={book.title} url={book.cover_url} color={storeColor} size="md" />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <AppText variant="label" style={{ fontSize: 16 }}>{book.title}</AppText>
          <AppText variant="caption" muted>{bookMeta(book)}</AppText>
          {caption ? <AppText variant="caption" muted style={{ marginTop: 4 }}>{caption}</AppText> : null}
        </View>
      </View>
      <TextField
        label="為什麼放進這個月？"
        optional
        multiline
        max={NOTE_MAX}
        value={note}
        onChangeText={setNote}
        placeholder="一兩句話就好，讀者會在書架上看到"
      />
      <View style={{ gap: Spacing.sm }}>
        <AppText variant="caption" muted>沒靈感？從這裡開始</AppText>
        <View style={chipRow}>
          {prompts.map((p) => (
            <Chip key={p} label={p} onPress={() => setNote((n) => `${n}${n && !n.endsWith('\n') ? '\n' : ''}${p}：`.slice(0, NOTE_MAX))} />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: Spacing.md }}>
        <Button kind="secondary" label={skipLabel} onPress={onSkip} disabled={saving} style={{ flex: 1 }} />
        <Button label={submitLabel} onPress={() => onSubmit(note)} loading={saving} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// S1 選書元件（彈出面板）：多選＝策展書架、單選＝店主閱讀（M4）
// ---------------------------------------------------------------------------
type Step = { kind: 'search' } | { kind: 'manual'; query: string } | { kind: 'note'; book: Book };

export function BookPicker({ visible, mode, storeColor, pickedIds, askNote, shelfCount = 0, onAdd, onClose, suggestions }: {
  visible: boolean;
  mode: 'multi' | 'single';
  storeColor: StoreColor;
  pickedIds: Set<string>;
  /** 多選模式：加入後接著寫推薦理由（C5，可略過） */
  askNote?: boolean;
  shelfCount?: number;
  onAdd: (book: Book, note: string | null) => Promise<void>;
  onClose: () => void;
  suggestions?: { label: string; books: Book[] };
}) {
  const c = useTheme();
  const [step, setStep] = useState<Step>({ kind: 'search' });
  const [busyId, setBusyId] = useState<string | null>(null);

  const close = () => {
    setStep({ kind: 'search' });
    onClose();
  };

  const add = async (book: Book, note: string | null) => {
    setBusyId(book.id);
    try {
      await onAdd(book, note);
      if (mode === 'single') close();
      else setStep({ kind: 'search' });
    } catch (e) {
      Alert.alert('沒有加入成功', friendlyError((e as Error).message));
    } finally {
      setBusyId(null);
    }
  };

  const pick = (book: Book) => {
    if (mode === 'multi' && askNote) setStep({ kind: 'note', book });
    else void add(book, null);
  };

  const title = step.kind === 'manual' ? '手動新增書籍' : step.kind === 'note' ? '推薦理由' : mode === 'multi' ? '加入書籍' : '選一本書';
  const back = step.kind === 'search' ? null : () => setStep({ kind: 'search' });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={back ?? close}>
      <Screen>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
          <View style={[styles.bar, { borderBottomColor: c.divider }]}>
            <View style={styles.barSide}>
              {back ? (
                <Pressable accessibilityRole="button" accessibilityLabel="回到搜尋" onPress={back} style={styles.barBtn}>
                  <Feather name="chevron-left" size={22} color={c.text} />
                  <AppText variant="caption">{step.kind === 'note' ? '搜尋結果' : '搜尋'}</AppText>
                </Pressable>
              ) : null}
            </View>
            <AppText variant="label" style={{ fontSize: 16 }}>{title}</AppText>
            <View style={[styles.barSide, { alignItems: 'flex-end' }]}>
              {step.kind === 'search' ? (
                <Pressable accessibilityRole="button" onPress={close} style={styles.barBtn}>
                  <AppText style={{ color: c.primary, fontWeight: '700' }}>{mode === 'multi' ? '完成' : '取消'}</AppText>
                </Pressable>
              ) : null}
            </View>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: Spacing.xl }} keyboardShouldPersistTaps="handled">
              {step.kind === 'search' ? (
                <BookSearchPanel
                  storeColor={storeColor}
                  mode={mode}
                  isPicked={(b) => pickedIds.has(b.id)}
                  onPick={pick}
                  onManual={(query) => setStep({ kind: 'manual', query })}
                  busyId={busyId}
                  autoFocus
                  suggestions={suggestions}
                />
              ) : step.kind === 'manual' ? (
                <ManualBookForm
                  initialTitle={step.query}
                  storeColor={storeColor}
                  submitLabel={mode === 'multi' ? (askNote ? '下一步：推薦理由' : '加入書架') : '選這本'}
                  onCreated={pick}
                />
              ) : (
                <NoteForm
                  key={step.book.id}
                  book={step.book}
                  storeColor={storeColor}
                  caption={`將成為書架上的第 ${shelfCount + 1} 本`}
                  saving={busyId === step.book.id}
                  onSkip={() => void add(step.book, null)}
                  onSubmit={(note) => void add(step.book, note)}
                />
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, paddingLeft: 14, minHeight: 48 },
  searchInput: { flex: 1, fontSize: 16, minHeight: 48, outlineWidth: 0 }, // 外框已畫在 search 容器上
  clear: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 56, paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  pick: { minHeight: MinTouch, minWidth: 72, paddingHorizontal: 12, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  barSide: { flex: 1 },
  barBtn: { minHeight: MinTouch, minWidth: MinTouch, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm },
});
