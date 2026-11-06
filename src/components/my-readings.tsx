import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { Chip, chipRow } from '@/components/form';
import { ReadingActions } from '@/components/reading-actions';
import { UndoToast } from '@/components/social';
import { AppText, Button, Card } from '@/components/ui';
import { MinTouch, Radius, Spacing, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { timeAgo } from '@/lib/period';
import { useDeleteReading, type MyReading } from '@/lib/readings';

type Filter = 'all' | 'reading' | 'finished';
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/**
 * R7 刪除後可復原：先從畫面拿掉，5 秒內按「復原」就不會真的刪除（心得也一起保住）。
 * 由畫面持有狀態，讓提示固定在螢幕底部（不跟著列表捲動）。
 */
export function useReadingRemoval() {
  const del = useDeleteReading();
  const { mutate } = del;
  const [pending, setPending] = useState<MyReading | null>(null);
  const pendingRef = useRef<MyReading | null>(null);

  const commit = useCallback(() => {
    const p = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (p) mutate(p.id);
  }, [mutate]);
  // 離開畫面時把還在等待的刪除做完
  useEffect(() => () => {
    if (pendingRef.current) mutate(pendingRef.current.id);
  }, [mutate]);

  const remove = useCallback((r: MyReading) => {
    if (pendingRef.current) mutate(pendingRef.current.id);
    pendingRef.current = r;
    setPending(r);
  }, [mutate]);
  const undo = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
  }, []);

  return { pending, remove, undo, commit };
}

export function ReadingRemovalToast({ removal }: { removal: ReturnType<typeof useReadingRemoval> }) {
  return (
    <UndoToast
      message={removal.pending ? `已從店主閱讀移除「${removal.pending.books.title}」` : null}
      onUndo={removal.undo}
      onHide={removal.commit}
    />
  );
}

/** R1 店主閱讀列表＋S6 空狀態 */
export function ReadingSection({ readings, color, loading, removal }: {
  readings: MyReading[] | undefined;
  color: StoreColor;
  loading: boolean;
  removal: ReturnType<typeof useReadingRemoval>;
}) {
  const c = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [menuFor, setMenuFor] = useState<MyReading | null>(null);
  const { pending, remove } = removal;

  if (loading || !readings) return <ActivityIndicator style={{ marginTop: 24 }} />;
  const visible = readings.filter((r) => r.id !== pending?.id);
  const counts = { all: visible.length, reading: visible.filter((r) => r.status === 'reading').length, finished: visible.filter((r) => r.status === 'finished').length };
  const shown = filter === 'all' ? visible : visible.filter((r) => r.status === filter);
  const add = () => router.push('/reading/new');

  if (visible.length === 0) {
    return (
      <Card style={{ alignItems: 'center', paddingVertical: 28, gap: Spacing.sm }}>
          <AppText variant="heading">記下你正在讀的書</AppText>
          <AppText muted style={{ textAlign: 'center' }}>{'讀到一半或剛讀完都可以，\n心得能一則一則慢慢累積。'}</AppText>
          <Button label="記錄一本書" onPress={add} style={{ alignSelf: 'stretch', marginTop: Spacing.md }} />
      </Card>
    );
  }

  return (
    <View style={{ gap: Spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={chipRow}>
          <Chip label={`全部 ${counts.all}`} selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label={`在讀 ${counts.reading}`} selected={filter === 'reading'} onPress={() => setFilter('reading')} />
          <Chip label={`讀完 ${counts.finished}`} selected={filter === 'finished'} onPress={() => setFilter('finished')} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="記錄一本書" onPress={add} style={[styles.add, { backgroundColor: c.primary }]}>
          <Feather name="plus" size={16} color={c.onPrimary} />
          <AppText variant="caption" style={{ color: c.onPrimary, fontWeight: '700' }}>新增</AppText>
        </Pressable>
      </View>

      {shown.map((r) => {
        const latest = r.reading_notes[0];
        return (
          <Card key={r.id} style={{ padding: 0 }}>
            <View style={{ flexDirection: 'row' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${r.books.title}，${r.status === 'reading' ? '在讀' : '讀完'}${r.is_public ? '' : '，只有自己看得到'}`}
                onPress={() => router.push({ pathname: '/reading/manage/[id]', params: { id: r.id } })}
                style={styles.main}>
                <BookCover title={r.books.title} url={r.books.cover_url} color={color} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                    <View style={[styles.pill, { backgroundColor: r.status === 'reading' ? c.successSurface : c.surfaceMuted }]}>
                      <AppText variant="caption" style={{ fontWeight: '700', color: r.status === 'reading' ? c.success : c.textSecondary }}>
                        {r.status === 'reading' ? '在讀' : `讀完${r.finished_at ? ` · ${md(r.finished_at)}` : ''}`}
                      </AppText>
                    </View>
                    {!r.is_public ? <Feather name="lock" size={13} color={c.textTertiary} accessible={false} /> : null}
                    <AppText variant="caption" muted>{timeAgo(r.updated_at)}</AppText>
                  </View>
                  <AppText variant="label" style={{ fontSize: 16 }}>{r.books.title}</AppText>
                  <AppText variant="caption" muted numberOfLines={2}>{latest ? `「${latest.body}」` : '還沒有心得'}</AppText>
                </View>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="更多操作" onPress={() => setMenuFor(r)} style={styles.menu}>
                <Feather name="more-horizontal" size={20} color={c.textSecondary} />
              </Pressable>
            </View>
          </Card>
        );
      })}
      {shown.length === 0 ? <AppText muted style={{ textAlign: 'center', marginTop: Spacing.lg }}>{filter === 'reading' ? '目前沒有在讀的書' : '還沒有讀完的書'}</AppText> : null}

      {menuFor ? (
        <ReadingActions reading={menuFor} visible onClose={() => setMenuFor(null)} onRemove={() => remove(menuFor)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  add: { minHeight: MinTouch - 8, paddingHorizontal: 12, borderRadius: Radius.pill, flexDirection: 'row', alignItems: 'center', gap: 4 },
  main: { flex: 1, flexDirection: 'row', gap: Spacing.md, padding: Spacing.lg },
  pill: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  menu: { width: MinTouch + 4, alignItems: 'center', justifyContent: 'center' },
});
