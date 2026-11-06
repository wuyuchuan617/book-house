import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { CurationActions } from '@/components/curation-actions';
import { AppText, Button, Card } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError, useCreateCuration, useMyCurations, type MyCurationRow } from '@/lib/curations';
import { currentPeriod, monthOf, nextPeriod, timeAgo } from '@/lib/period';

/** M1 我的書店・策展列表；沒有策展時是 S5 空狀態 */
export function CurationSection() {
  const c = useTheme();
  const { data, isLoading } = useMyCurations();
  const create = useCreateCuration();
  const [menuFor, setMenuFor] = useState<MyCurationRow | null>(null);

  if (isLoading || !data) return <ActivityIndicator style={{ marginTop: 24 }} />;

  const cur = currentPeriod();
  const next = nextPeriod();
  const live = (p: string) => data.some((r) => r.period === p && r.status !== 'draft');
  // 本月還沒發布 → 新增本月；本月已發布 → 新增下個月；兩個月都有 → 不顯示
  const target = !live(cur) ? cur : !live(next) ? next : null;

  const open = (id: string) => router.push({ pathname: '/curation/[id]', params: { id } });
  const startNew = () =>
    target &&
    create.mutate({ period: target }, { onSuccess: (r) => open(r.id), onError: (e) => Alert.alert('沒有成功', friendlyError(e.message)) });

  const upcoming = data.filter((r) => r.period >= cur);
  const past = data.filter((r) => r.period < cur);

  if (data.length === 0) {
    return (
      <Card style={{ alignItems: 'center', paddingVertical: 28, gap: Spacing.sm }}>
        <AppText variant="heading">{`${monthOf(cur)} 月還沒有策展`}</AppText>
        <AppText muted style={{ textAlign: 'center' }}>{'讀者在你發布前看不到你的書店。\n挑一個主題，放上一本書就能發布。'}</AppText>
        <Button label={`新增 ${monthOf(cur)} 月策展`} loading={create.isPending} onPress={startNew} style={{ alignSelf: 'stretch', marginTop: Spacing.md }} />
        <Button kind="link" label="看看別人怎麼策展" onPress={() => router.navigate('/')} />
      </Card>
    );
  }

  return (
    <View style={{ gap: Spacing.md }}>
      <View style={styles.head}>
        <AppText variant="label" style={{ fontSize: 15 }}>{`策展 · ${data.length}`}</AppText>
      </View>
      {target ? (
        <Pressable
          accessibilityRole="button"
          onPress={startNew}
          disabled={create.isPending}
          style={({ pressed }) => [styles.add, { borderColor: c.primary, opacity: pressed ? 0.7 : 1 }]}>
          {create.isPending ? <ActivityIndicator /> : <Feather name="plus" size={18} color={c.primary} />}
          <AppText variant="label" style={{ color: c.primary, fontSize: 15 }}>{`新增 ${monthOf(target)} 月策展`}</AppText>
        </Pressable>
      ) : null}
      {upcoming.map((r) => <Row key={r.id} row={r} onOpen={() => open(r.id)} onMenu={() => setMenuFor(r)} />)}
      {past.length ? (
        <>
          <AppText variant="label" muted style={{ marginTop: Spacing.md }}>{`往期 · ${past.length}`}</AppText>
          {past.map((r) => <Row key={r.id} row={r} onOpen={() => open(r.id)} onMenu={() => setMenuFor(r)} />)}
        </>
      ) : null}
      {menuFor ? (
        <CurationActions curation={menuFor} visible onClose={() => setMenuFor(null)} />
      ) : null}
    </View>
  );
}

function Row({ row, onOpen, onMenu }: { row: MyCurationRow; onOpen: () => void; onMenu: () => void }) {
  const c = useTheme();
  const isCur = row.period === currentPeriod();
  const status =
    row.status === 'published'
      ? { label: '已發布', bg: c.successSurface, fg: c.success }
      : row.status === 'scheduled'
        ? { label: `${monthOf(row.period)}/1 上架`, bg: c.surfaceMuted, fg: c.text }
        : { label: '草稿', bg: c.surfaceMuted, fg: c.textSecondary };

  const todo: string[] = [];
  if (row.status === 'draft') {
    if (!row.title) todo.push('還差標題');
    if (row.book_count === 0) todo.push('還差書');
    else if (!row.description) todo.push('還差說明');
  }
  const meta = [
    `${row.book_count} 本書`,
    row.status === 'published' && row.save_count ? `被收藏 ${row.save_count} 次` : null,
    row.status === 'draft' ? `${timeAgo(row.updated_at)}編輯` : null,
    ...todo,
  ].filter(Boolean).join(' · ');

  return (
    <Card style={{ padding: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${monthOf(row.period)} 月策展：${row.title ?? '未命名'}，${status.label}`} onPress={onOpen} style={styles.rowMain}>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
            <View style={[styles.pill, { backgroundColor: status.bg }]}>
              <AppText variant="caption" style={{ color: status.fg, fontWeight: '700' }}>{status.label}</AppText>
            </View>
            <AppText variant="caption" muted>{`${monthOf(row.period)} 月${isCur ? ' · 本月' : ''}`}</AppText>
          </View>
          <AppText variant="label" style={{ fontSize: 16, marginTop: 6 }}>{row.title || '（未命名策展）'}</AppText>
          <AppText variant="caption" muted style={{ marginTop: 2 }}>{meta}</AppText>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="更多操作" onPress={onMenu} style={styles.menu}>
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
