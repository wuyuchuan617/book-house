import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import type { NoteKind, ReadingNote } from '@/lib/browse';
import { tr } from '@/lib/i18n';
import { timeAgo } from '@/lib/period';
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

/** 列表裡的一則心得（店主與讀者共用） */
export function NoteCard({ note, onPress, latest }: { note: ReadingNote; onPress?: () => void; latest?: boolean }) {
  const c = useTheme();
  const inner = (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        <KindChip kind={note.kind} />
        <View style={{ flex: 1 }} />
        <AppText variant="caption" muted>{latest ? timeAgo(note.created_at) : md(note.created_at)}</AppText>
      </View>
      {note.title ? <AppText variant="label">{note.title}</AppText> : null}
      <NoteBody note={note} lines={onPress ? 6 : undefined} />
      <NotePhotos paths={note.photo_paths} />
    </View>
  );
  if (!onPress) return <View style={[styles.card, { backgroundColor: c.surface }]}>{inner}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: c.surface, opacity: pressed ? 0.9 : 1 }]}>
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  card: { borderRadius: Radius.lg, padding: Spacing.lg },
});
