import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Chip, chipRow } from '@/components/form';
import { PostCard } from '@/components/posts-explore';
import { RxCard } from '@/components/rx-explore';
import { AppText, Button, Card } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useExploreFeed } from '@/lib/browse';
import { useExplorePosts } from '@/lib/diary';
import { tr } from '@/lib/i18n';
import { useRxSearch } from '@/lib/store-v16';
import type { ExploreItem } from '@/lib/queries';

export type ActiveFilter = { key: string; label: string; clear: () => void };

/** W6 ／ v1.8.1 AJ6 ／ v1.8.2 AK1：左邊是分頁自己的小膠囊＋生效中的條件（點 ✕ 清掉），最右邊是只有圖示的「篩選」（有條件時右上小圓點寫數字） */
export function FilterBar({ active, onOpen, lead }: { active: ActiveFilter[]; onOpen: () => void; lead?: React.ReactNode }) {
  const c = useTheme();
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.bar} keyboardShouldPersistTaps="handled">
        {lead}
        {active.map((a) => (
          <Pressable
            key={a.key}
            accessibilityRole="button"
            accessibilityLabel={tr('清掉「{label}」', { label: a.label })}
            onPress={a.clear}
            style={[styles.active, { backgroundColor: c.text }]}>
            <AppText variant="caption" style={{ color: c.background, fontWeight: '600' }}>{a.label}</AppText>
            <Feather name="x" size={12} color={c.background} />
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active.length ? tr('篩選，{n} 個條件', { n: active.length }) : tr('篩選')}
        hitSlop={4}
        onPress={onOpen}
        style={[styles.filterBtn, { backgroundColor: c.surface, borderColor: active.length ? c.text : c.border }]}>
        <Feather name="sliders" size={17} color={c.text} />
        {active.length ? (
          <View style={[styles.dot, { backgroundColor: c.primary }]}>
            <AppText style={{ color: c.onPrimary, fontSize: 10, lineHeight: 13, fontWeight: '700' }}>{String(active.length)}</AppText>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

export type FilterGroup = { title: string; note?: string; options: { key: string; label: string; selected: boolean; onPress: () => void }[] };

/** W7 篩選面板：每個分頁各自的條件；跟其他底部選單同一種底座 */
export function FilterSheet({ visible, title, groups, onClear, onClose, resultLabel }: {
  visible: boolean;
  title: string;
  groups: FilterGroup[];
  onClear: () => void;
  onClose: () => void;
  resultLabel: string;
}) {
  const c = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose} style={{ paddingHorizontal: Spacing.xl, gap: Spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <AppText variant="heading" style={{ flex: 1, fontSize: 17 }}>{title}</AppText>
        <Pressable accessibilityRole="button" onPress={onClear} hitSlop={8}>
          <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('全部清除')}</AppText>
        </Pressable>
      </View>
      <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: Spacing.lg }}>
        {groups.map((g) => (
          <View key={g.title} style={{ gap: Spacing.sm }}>
            <AppText variant="label">
              {g.title}
              {g.note ? <AppText variant="caption" muted>{`  ${g.note}`}</AppText> : null}
            </AppText>
            <View style={chipRow}>
              {g.options.map((o) => <Chip key={o.key} label={o.label} selected={o.selected} onPress={o.onPress} />)}
            </View>
          </View>
        ))}
      </ScrollView>
      <Button label={resultLabel} onPress={onClose} />
    </BottomSheet>
  );
}

/**
 * W9 搜尋結果：三個分頁共用一個搜尋列，一次搜策展、貼文、處方箋；
 * 都找不到時給三個動作：加入想讀、發起處方箋（帶入「想找：…」）、看看其他主題。
 */
export function SearchResults({ query, onSeeCurations, onClear, renderCuration }: {
  query: string;
  onSeeCurations: () => void;
  onClear: () => void;
  renderCuration: (item: ExploreItem) => React.ReactNode;
}) {
  const c = useTheme();
  const { requireAuth } = useAuth();
  const curations = useExploreFeed({ query });
  const posts = useExplorePosts('all', null, query);
  const rx = useRxSearch(query);
  const loading = curations.isPending || posts.isPending || rx.isPending;
  const cs = curations.data ?? [];
  const ps = posts.data ?? [];
  const rs = rx.data ?? [];

  if (loading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  const none = !cs.length && !ps.length && !rs.length;

  return (
    <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md, paddingBottom: 96 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {cs.length ? (
        <>
          <Section title={tr('策展 · {n}', { n: cs.length })} more={cs.length > 3 ? onSeeCurations : undefined} />
          {cs.slice(0, 3).map((i) => <View key={i.curation_id}>{renderCuration(i)}</View>)}
        </>
      ) : null}
      {ps.length ? (
        <>
          <Section title={tr('手記 · {n}', { n: ps.length })} />
          {ps.slice(0, 3).map((p) => <PostCard key={p.id} post={p} />)}
        </>
      ) : null}
      {rs.length ? (
        <>
          <Section title={tr('處方箋 · {n}', { n: rs.length })} />
          {rs.slice(0, 3).map((r) => <RxCard key={r.id} item={r} />)}
        </>
      ) : null}
      <Card style={[styles.none, { borderColor: c.border }]}>
        <AppText variant="label" style={{ textAlign: 'center' }}>{none ? tr('找不到「{query}」', { query }) : tr('沒找到想要的？')}</AppText>
        <View style={[chipRow, { justifyContent: 'center' }]}>
          <Chip label={tr('加入想讀')} selected onPress={() => requireAuth(() => router.push({ pathname: '/want-book', params: { q: query } }))} />
          <Chip label={tr('發起處方箋')} onPress={() => requireAuth(() => router.push({ pathname: '/rx/new', params: { title: tr('想找：{q}', { q: query }) } }))} />
          <Chip label={tr('看看其他主題')} onPress={onClear} />
        </View>
        <AppText variant="caption" muted style={{ textAlign: 'center' }}>{tr('「加入想讀」直接用這個關鍵字搜書；「發起處方箋」請大家幫你找。')}</AppText>
      </Card>
    </ScrollView>
  );
}

function Section({ title, more }: { title: string; more?: () => void }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: Spacing.xs }}>
      <AppText variant="label" style={{ flex: 1 }}>{title}</AppText>
      {more ? (
        <Pressable accessibilityRole="button" onPress={more} hitSlop={8}>
          <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('看全部 ›')}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingRight: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing.xs },
  bar: { paddingLeft: Spacing.xl, paddingRight: Spacing.xs, gap: Spacing.sm, alignItems: 'center' },
  filterBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  active: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingHorizontal: 10, borderRadius: Radius.pill },
  none: { borderWidth: 1.5, borderStyle: 'dashed', backgroundColor: 'transparent', gap: Spacing.sm, alignItems: 'center', marginTop: Spacing.sm, minHeight: MinTouch },
});
