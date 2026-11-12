import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { tr } from '@/lib/i18n';
import { useDismissOnboarding, useOnboarding } from '@/lib/flow';

const FOLLOW_GOAL = 3;

/** v1.9 AL1 新用戶「開始的三步」：追蹤 3 間書店 → 收藏一本書 → 寫第一則日記。做完或按「之後再說」就收起來 */
export function OnboardingCard({ onFollow }: { onFollow: () => void }) {
  const c = useTheme();
  const { data } = useOnboarding();
  const dismiss = useDismissOnboarding();
  if (!data || data.dismissed) return null;
  const steps = [
    { done: data.follows >= FOLLOW_GOAL, title: tr('追蹤 {n} 間書店', { n: FOLLOW_GOAL }), sub: data.follows ? tr('已追蹤 {n} 間', { n: data.follows }) : tr('他們的新策展、手記會整理在「追蹤」'), go: onFollow },
    { done: data.saves > 0, title: tr('收藏一本想讀的書'), sub: tr('在任何一檔策展按書旁邊的書籤'), go: () => router.setParams({ tab: 'curations' }) },
    { done: data.entries > 0, title: tr('寫第一則日記'), sub: tr('今天讀了什麼，一句話就好'), go: () => router.push({ pathname: '/diary/compose', params: { kind: 'post' } }) },
  ];
  const doneN = steps.filter((s) => s.done).length;
  if (doneN === steps.length) return null;
  const current = steps.findIndex((s) => !s.done);
  return (
    <Card style={{ gap: 2, paddingBottom: Spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        <AppText variant="label" style={{ fontSize: 16, flex: 1 }}>{tr('開始的三步')}</AppText>
        <AppText variant="caption" muted>{`${doneN} / ${steps.length}`}</AppText>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={() => { track('onboarding_dismissed', { done: doneN }); dismiss.mutate(); }}>
          <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('之後再說')}</AppText>
        </Pressable>
      </View>
      <View style={[styles.track, { backgroundColor: c.divider }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: steps.length, now: doneN }}>
        <View style={{ width: `${(doneN / steps.length) * 100}%`, height: 4, borderRadius: 2, backgroundColor: c.success }} />
      </View>
      {steps.map((s, i) => (
        <Pressable key={s.title} accessibilityRole="button" accessibilityState={{ checked: s.done }} disabled={s.done} onPress={s.go} style={styles.step}>
          {s.done ? (
            <View style={[styles.mark, { backgroundColor: c.success }]}><Feather name="check" size={14} color={c.surface} /></View>
          ) : (
            <View style={[styles.mark, { borderWidth: 1.5, borderColor: i === current ? c.primary : c.border }]}>
              <AppText variant="caption" style={{ fontWeight: '700', color: i === current ? c.primary : c.textSecondary }}>{String(i + 1)}</AppText>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <AppText variant="label" style={s.done ? { color: c.textSecondary, textDecorationLine: 'line-through' } : undefined}>{s.title}</AppText>
            <AppText variant="caption" muted>{s.sub}</AppText>
          </View>
          {i === current ? <Feather name="chevron-right" size={16} color={c.textTertiary} /> : null}
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, marginTop: Spacing.sm, marginBottom: 2 },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 52 },
  mark: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
