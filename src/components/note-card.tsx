import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { SwipeRow, swipeA11y, type SwipeAction } from '@/components/swipe-row';
import { AppText } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import type { NoteKind, ReadingNote } from '@/lib/browse';
import { tr } from '@/lib/i18n';
import { noteTime } from '@/lib/period';
import { useNoteImageUrls } from '@/lib/readings';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export const NOTE_KINDS: NoteKind[] = ['quote', 'reflection', 'thought'];

export function kindLabel(k: NoteKind) {
  return { quote: tr('摘句'), reflection: tr('心得'), thought: tr('想法') }[k];
}

/** 摘句紫、心得綠、想法赭 */
export function useKindColors(k: NoteKind) {
  const c = useTheme();
  const dark = useColorScheme() === 'dark';
  if (k === 'quote') return { fg: dark ? '#C9BEF0' : '#5A4B8A', bg: dark ? '#3A3352' : '#EEEAF6' };
  if (k === 'thought') return { fg: c.primary, bg: dark ? '#4A3328' : '#F6E9E2' };
  return { fg: c.success, bg: c.successSurface };
}

export function KindChip({ kind }: { kind: NoteKind }) {
  const k = useKindColors(kind);
  return (
    <View style={[styles.chip, { backgroundColor: k.bg }]}>
      <AppText variant="caption" style={{ color: k.fg, fontWeight: '700', fontSize: 11 }}>{kindLabel(kind)}</AppText>
    </View>
  );
}

/** 心得的圖片（非公開，用短效網址） */
export function NotePhotos({ paths, size = 80, full }: { paths: string[]; size?: number; full?: boolean }) {
  const c = useTheme();
  const { data: urls } = useNoteImageUrls(paths);
  if (!paths.length) return null;
  return (
    <View style={{ flexDirection: full ? 'column' : 'row', gap: 6 }}>
      {paths.map((p, i) => (
        <Image
          key={p}
          source={urls?.[i] ? { uri: urls[i]! } : undefined}
          style={full ? { width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.md, backgroundColor: c.surfaceMuted } : { width: size, height: size * 0.75, borderRadius: 8, backgroundColor: c.surfaceMuted }}
          contentFit="cover"
          accessibilityLabel={tr('心得的圖片 {n}', { n: i + 1 })}
        />
      ))}
    </View>
  );
}

/** 心得本文：摘句用引號與左邊線 */
export function NoteBody({ note, lines }: { note: Pick<ReadingNote, 'kind' | 'body' | 'page_ref'>; lines?: number }) {
  const k = useKindColors(note.kind);
  const c = useTheme();
  if (note.kind === 'quote') {
    return (
      <View style={{ gap: 4 }}>
        <View style={{ borderLeftWidth: 3, borderLeftColor: k.fg, paddingLeft: Spacing.md }}>
          <AppText numberOfLines={lines} style={{ fontFamily: 'serif', fontSize: 16, lineHeight: 26 }}>{tr('「{body}」', { body: note.body })}</AppText>
        </View>
        {note.page_ref ? <AppText variant="caption" style={{ color: c.textSecondary }}>{note.page_ref}</AppText> : null}
      </View>
    );
  }
  return <AppText numberOfLines={lines} style={{ lineHeight: 23 }}>{note.body}</AppText>;
}

/**
 * 心得時間軸（店主「這本書」與讀者「店主閱讀」共用同一種卡片）：
 * 左邊時間線＋圓點（最新一則上色），右邊類型、日期、標題、內容、圖片；最後一列是「開始讀」。
 * 店主版傳 actionsFor：每一則可以往左滑（編輯、刪除）。
 */
export function NoteTimeline({ notes, startedAt, onPressNote, actionsFor, highlightLatest = true, photoSize = 96 }: {
  notes: ReadingNote[];
  startedAt?: string | null;
  onPressNote?: (n: ReadingNote) => void;
  actionsFor?: (n: ReadingNote) => SwipeAction[];
  highlightLatest?: boolean;
  photoSize?: number;
}) {
  const c = useTheme();
  return (
    <View style={[styles.timeline, { backgroundColor: c.surface }]}>
      {notes.map((n, i) => {
        const last = i === notes.length - 1 && !startedAt;
        const item = (
          <Pressable
            accessibilityRole={onPressNote ? 'button' : undefined}
            disabled={!onPressNote}
            onPress={() => onPressNote?.(n)}
            style={({ pressed }) => [styles.item, { opacity: pressed ? 0.85 : 1 }]}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: i === 0 && highlightLatest ? c.primary : c.border }]} />
              {!last ? <View style={[styles.line, { backgroundColor: c.divider }]} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : Spacing.lg, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <KindChip kind={n.kind} />
                <AppText variant="caption" muted>{noteTime(n.created_at)}</AppText>
              </View>
              {n.title ? <AppText variant="label">{n.title}</AppText> : null}
              <NoteBody note={n} lines={onPressNote ? 6 : undefined} />
              <NotePhotos paths={n.photo_paths} size={photoSize} />
            </View>
          </Pressable>
        );
        const actions = actionsFor?.(n);
        if (!actions?.length) return <View key={n.id}>{item}</View>;
        return (
          <View key={n.id} {...swipeA11y(actions)} style={{ marginHorizontal: -Spacing.lg, paddingHorizontal: 0 }}>
            <SwipeRow actions={actions}>
              <View style={{ paddingHorizontal: Spacing.lg }}>{item}</View>
            </SwipeRow>
          </View>
        );
      })}
      {startedAt ? (
        <View style={styles.item}>
          <View style={styles.rail}>
            <View style={[styles.dot, { backgroundColor: c.border }]} />
          </View>
          <AppText variant="caption" muted>{tr('{p0} · 開始讀', { p0: md(startedAt) })}</AppText>
        </View>
      ) : null}
    </View>
  );
}

/** 書店頁「正在讀」列表上的最新一則：依類型顯示（摘句才加引號） */
export function NoteSnippet({ note }: { note: Pick<ReadingNote, 'kind' | 'title' | 'body' | 'created_at'> }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 }}>
      <KindChip kind={note.kind} />
      <AppText variant="caption" style={{ flex: 1, lineHeight: 19 }} numberOfLines={3}>
        {note.title ? `${note.title}｜` : ''}
        {note.kind === 'quote' ? tr('「{body}」', { body: note.body }) : note.body}
        <AppText variant="caption" muted>{` · ${noteTime(note.created_at)}`}</AppText>
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  timeline: { borderRadius: Radius.xl, padding: Spacing.lg, overflow: 'hidden' },
  item: { flexDirection: 'row', gap: Spacing.md },
  rail: { width: 12, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  line: { width: 2, flex: 1, marginTop: 4 },
});
