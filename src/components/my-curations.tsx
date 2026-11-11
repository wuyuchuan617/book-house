import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { CurationActions } from '@/components/curation-actions';
import { AppText, Button, Card } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError, useCreateCuration, useMyCurations, useSuggestedPeriod, type MyCurationRow } from '@/lib/curations';
import { currentPeriod, lastOpenPeriod, monthOf, taipeiDate, timeAgo } from '@/lib/period';
import { tr } from '@/lib/i18n';

/** M1 我的書店・策展列表；沒有策展時是 S5 空狀態 */
export function CurationSection() {
  const c = useTheme();
  const { data, isLoading } = useMyCurations();
  const { data: suggested } = useSuggestedPeriod();
  const create = useCreateCuration();
  // 選單關掉時保留最後一筆，讓選單裡的動作（等選單收合後才執行）和刪除確認還在
  const [menuFor, setMenuItem] = useState<MyCurationRow | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const setMenuFor = (r: MyCurationRow) => {
    setMenuItem(r);
    setMenuOpen(true);
  };

  if (isLoading || !data) return <ActivityIndicator style={{ marginTop: 24 }} />;

  const cur = currentPeriod();
  // 新增策展接在最後一個月之後（例：已有 12 月草稿 → 新增明年 1 月）；最多排到本月起 4 個月內
  const nextUp = suggested ?? cur;
  const target = nextUp <= lastOpenPeriod() ? nextUp : null;

  const open = (id: string) => router.push({ pathname: '/curation/[id]', params: { id } });
  const startNew = () =>
    target &&
    create.mutate({ period: target }, { onSuccess: (r) => open(r.id), onError: (e) => Alert.alert(tr('沒有成功'), friendlyError(e.message)) });

  const upcoming = data.filter((r) => r.period >= cur);
  const past = data.filter((r) => r.period < cur);

  if (data.length === 0) {
    return (
      <Card style={{ alignItems: 'center', paddingVertical: 28, gap: Spacing.sm }}>
        <AppText variant="heading">{tr('{p0} 月還沒有策展', { p0: monthOf(cur) })}</AppText>
        <AppText muted style={{ textAlign: 'center' }}>{tr('讀者在你發布前看不到你的書店。\n挑一個主題，放上一本書就能發布。')}</AppText>
        <Button label={tr('新增 {p0} 月策展', { p0: monthOf(cur) })} loading={create.isPending} onPress={startNew} style={{ alignSelf: 'stretch', marginTop: Spacing.md }} />
        <Button kind="link" label={tr('看看別人怎麼策展')} onPress={() => router.navigate('/')} />
      </Card>
    );
  }

  return (
    <View style={{ gap: Spacing.md }}>
      <View style={styles.head}>
        <AppText variant="label" style={{ fontSize: 15 }}>{tr('策展 · {length}', { length: data.length })}</AppText>
      </View>
      {target ? (
        <Pressable
          accessibilityRole="button"
          onPress={startNew}
          disabled={create.isPending}
          style={({ pressed }) => [styles.add, { borderColor: c.primary, opacity: pressed ? 0.7 : 1 }]}>
          {create.isPending ? <ActivityIndicator /> : <Feather name="plus" size={18} color={c.primary} />}
          <AppText variant="label" style={{ color: c.primary, fontSize: 15 }}>{tr('新增 {p0} 月策展', { p0: monthOf(target) })}</AppText>
        </Pressable>
      ) : (
        <AppText variant="caption" muted style={{ textAlign: 'center' }}>{tr('已經排到 {p0} 月了，最多可以先排 3 個月。', { p0: monthOf(lastOpenPeriod()) })}</AppText>
      )}
      {upcoming.map((r) => <Row key={r.id} row={r} onOpen={() => open(r.id)} onMenu={() => setMenuFor(r)} />)}
      {past.length ? (
        <>
          <AppText variant="label" muted style={{ marginTop: Spacing.md }}>{tr('往期 · {length}', { length: past.length })}</AppText>
          {past.map((r) => <Row key={r.id} row={r} onOpen={() => open(r.id)} onMenu={() => setMenuFor(r)} />)}
        </>
      ) : null}
      {menuFor ? (
        <CurationActions curation={menuFor} visible={menuOpen} onClose={() => setMenuOpen(false)} />
      ) : null}
    </View>
  );
}

function Row({ row, onOpen, onMenu }: { row: MyCurationRow; onOpen: () => void; onMenu: () => void }) {
  const c = useTheme();
  const isCur = row.period === currentPeriod();
  const status =
    row.status === 'published'
      ? { label: tr('已發布'), bg: c.successSurface, fg: c.success }
      : row.status === 'scheduled'
        ? { label: tr('{md} 上架', { md: row.scheduled_for ? taipeiDate(row.scheduled_for).md : `${monthOf(row.period)}/1` }), bg: c.surfaceMuted, fg: c.text }
        : { label: tr('草稿'), bg: c.surfaceMuted, fg: c.textSecondary };

  const todo: string[] = [];
  if (row.status === 'draft') {
    if (!row.title) todo.push(tr('還差標題'));
    if (row.book_count === 0) todo.push(tr('還差書'));
    else if (!row.description) todo.push(tr('還差說明'));
  }
  const meta = [
    tr('{book_count} 本書', { book_count: row.book_count }),
    row.status === 'published' ? tr('拜訪 {visit_count}', { visit_count: row.visit_count ?? 0 }) : null,
    row.status === 'published' ? tr('收藏 {save_count}', { save_count: row.save_count }) : null,
    row.status === 'draft' ? tr('{p0}編輯', { p0: timeAgo(row.updated_at) }) : null,
    ...todo,
  ].filter(Boolean).join(' · ');

  return (
    <Card style={{ padding: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={tr('{p0} 月策展：{p1}，{label}', { p0: monthOf(row.period), p1: row.title ?? tr('未命名'), label: status.label })} onPress={onOpen} style={styles.rowMain}>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
            <View style={[styles.pill, { backgroundColor: status.bg }]}>
              <AppText variant="caption" style={{ color: status.fg, fontWeight: '700' }}>{status.label}</AppText>
            </View>
            <AppText variant="caption" muted>{tr('{p0} 月{p1}', { p0: monthOf(row.period), p1: isCur ? tr(' · 本月') : '' })}</AppText>
          </View>
          <AppText variant="label" style={{ fontSize: 16, marginTop: 6 }}>{row.title || tr('（未命名策展）')}</AppText>
          <AppText variant="caption" muted style={{ marginTop: 2 }}>{meta}</AppText>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={tr('更多操作')} onPress={onMenu} style={styles.menu}>
          <Feather name="more-horizontal" size={20} color={c.textSecondary} />
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm },
  add: { minHeight: 52, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  rowMain: { flex: 1, padding: Spacing.lg },
  pill: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  menu: { width: MinTouch + 4, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
});
