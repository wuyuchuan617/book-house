import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { AppText } from '@/components/ui';
import { Radius, Spacing, StoreColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { tr } from '@/lib/i18n';
import { teaserError, teaserWhen, useExploreTeasers, useTeaserRemind, type Teaser } from '@/lib/teaser';

/** AD1 書店頁 › 策展最上面的預告卡：先公開的書＋模糊的其他本、「上架提醒我」 */
export function TeaserCard({ teaser, mine }: { teaser: Teaser; mine?: boolean }) {
  const c = useTheme();
  const { requireAuth } = useAuth();
  const remind = useTeaserRemind();
  const hex = StoreColors[teaser.store.color]?.hex ?? c.primary;
  const toggle = () =>
    requireAuth(() => remind.mutate({ id: teaser.id, on: !teaser.reminded }, { onError: (e) => Alert.alert(tr('沒有成功'), teaserError(e.message)) }));
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.primary }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={[styles.badge, { backgroundColor: c.primary }]}><AppText variant="caption" style={{ color: c.onPrimary, fontWeight: '700', fontSize: 11 }}>{tr('預告')}</AppText></View>
        <AppText variant="caption" muted>{tr('{m} 月策展 · {when}', { m: Number(teaser.period.slice(5, 7)), when: teaserWhen(teaser) })}</AppText>
      </View>
      {teaser.title ? <AppText variant="title" style={{ fontSize: 19, lineHeight: 26 }}>{teaser.title}</AppText> : null}
      {teaser.text ? <AppText style={{ lineHeight: 22 }}>{teaser.text}</AppText> : null}
      <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {teaser.books.map((b) => (
          <Pressable key={b.id} accessibilityRole="link" accessibilityLabel={b.title} onPress={() => router.push({ pathname: '/book/[id]', params: { id: b.id } })}>
            <BookCover title={b.title} url={b.cover_url} color={teaser.store.color} size="md" />
          </Pressable>
        ))}
        {Array.from({ length: Math.min(teaser.hidden_count, 5) }).map((_, i) => (
          <View key={`h${i}`} accessible accessibilityLabel={tr('還沒揭曉的書')} style={[styles.hidden, { backgroundColor: hex }]}>
            <Feather name="help-circle" size={16} color="rgba(255,255,255,0.8)" />
          </View>
        ))}
      </View>
      {teaser.hidden_count > 0 ? (
        <AppText variant="caption" muted>{teaser.books.length ? tr('先公開 {a} 本，其他 {b} 本上架那天揭曉', { a: teaser.books.length, b: teaser.hidden_count }) : tr('{b} 本書上架那天揭曉', { b: teaser.hidden_count })}</AppText>
      ) : null}
      {mine ? (
        <AppText variant="caption" muted>{tr('{n} 人在等', { n: teaser.waiting })}</AppText>
      ) : (
        <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: teaser.reminded }}
            onPress={toggle}
            style={[styles.remind, { backgroundColor: teaser.reminded ? c.surface : c.text, borderColor: c.text }]}>
            <Feather name={teaser.reminded ? 'check' : 'bell'} size={15} color={teaser.reminded ? c.text : c.background} />
            <AppText variant="label" style={{ color: teaser.reminded ? c.text : c.background }}>{teaser.reminded ? tr('上架會通知你') : tr('上架提醒我')}</AppText>
          </Pressable>
          <AppText variant="caption" muted>{tr('{n} 人在等', { n: teaser.waiting })}</AppText>
        </View>
      )}
    </View>
  );
}

/** AD3 探索 › 策展最上面「即將上架」 */
export function TeaserStrip() {
  const c = useTheme();
  const { data } = useExploreTeasers();
  if (!data?.length) return null;
  return (
    <View style={{ gap: Spacing.sm }}>
      <AppText variant="label" style={{ fontSize: 15 }}>{tr('即將上架')}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
        {data.map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: t.store.slug } })}
            style={[styles.soon, { backgroundColor: c.surface }]}>
            <View style={[styles.soonTop, { backgroundColor: StoreColors[t.store.color]?.hex ?? c.primary }]}>
              <View style={styles.soonWhen}><AppText variant="caption" style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 11 }}>{teaserWhen(t)}</AppText></View>
            </View>
            <AppText variant="label" numberOfLines={2}>{t.title ?? tr('（未命名策展）')}</AppText>
            <AppText variant="caption" muted numberOfLines={1}>{tr('{store} · {n} 人在等', { store: t.store.name, n: t.waiting })}</AppText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.xl, borderWidth: 1.5, borderStyle: 'dashed', padding: Spacing.lg, gap: Spacing.sm },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  hidden: { width: 52, height: 76, borderRadius: 3, opacity: 0.45, alignItems: 'center', justifyContent: 'center' },
  remind: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: Spacing.lg, borderRadius: Radius.md, borderWidth: 1 },
  soon: { width: 156, borderRadius: Radius.lg, padding: Spacing.sm, gap: 4 },
  soonTop: { height: 66, borderRadius: Radius.md, justifyContent: 'flex-end', padding: 6 },
  soonWhen: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
});
