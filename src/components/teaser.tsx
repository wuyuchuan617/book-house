import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { BottomSheet } from '@/components/bottom-sheet';
import { StoreAvatar } from '@/components/social';
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
      {teaser.title ? <AppText variant="title" style={{ fontSize: 18, lineHeight: 26 }}>{teaser.title}</AppText> : null}
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

/** AD1 ／ v1.8.3 AK17 探索 › 策展最上面的「即將上架」：收成一行（書店頭像＋「12 月 2 檔：…」），點了從底部打開看全部預告 */
export function TeaserStrip() {
  const c = useTheme();
  const { data } = useExploreTeasers();
  const [open, setOpen] = useState(false);
  if (!data?.length) return null;
  const months = [...new Set(data.map((t) => Number(t.period.slice(5, 7))))];
  const names = data.map((t) => t.title ?? tr('（未命名策展）')).join(tr('、'));
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('即將上架 {n} 檔：{names}', { n: data.length, names })}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.line, { backgroundColor: c.surface, opacity: pressed ? 0.8 : 1 }]}>
        <View style={[styles.lineTag, { backgroundColor: c.surfaceMuted }]}>
          <AppText variant="caption" style={{ color: c.primary, fontWeight: '700', fontSize: 12 }}>{tr('即將上架')}</AppText>
        </View>
        <View style={{ flexDirection: 'row' }}>
          {data.slice(0, 3).map((t, i) => (
            <View key={t.id} style={{ marginLeft: i ? -6 : 0, borderWidth: 2, borderColor: c.surface, borderRadius: 9 }}>
              <StoreAvatar name={t.store.name} color={t.store.color} size={20} path={t.store.avatar_path} />
            </View>
          ))}
        </View>
        <AppText variant="caption" numberOfLines={1} style={{ flex: 1, color: c.text }}>
          {months.length === 1 ? tr('{m} 月 {n} 檔：{names}', { m: months[0], n: data.length, names }) : tr('{n} 檔：{names}', { n: data.length, names })}
        </AppText>
        <Feather name="chevron-right" size={16} color={c.textTertiary} />
      </Pressable>
      <BottomSheet visible={open} onClose={() => setOpen(false)} style={{ paddingHorizontal: Spacing.xl, gap: Spacing.md }}>
        <AppText variant="heading">{tr('即將上架')}</AppText>
        <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: Spacing.sm }}>
          {data.map((t) => (
            <Pressable
              key={t.id}
              accessibilityRole="link"
              onPress={() => {
                setOpen(false);
                setTimeout(() => router.push({ pathname: '/store/[slug]', params: { slug: t.store.slug } }), 300);
              }}
              style={[styles.soonRow, { backgroundColor: c.surface }]}>
              <View style={[styles.soonDot, { backgroundColor: StoreColors[t.store.color]?.hex ?? c.primary }]}>
                <AppText variant="caption" style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 11 }}>{teaserWhen(t)}</AppText>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label" numberOfLines={1}>{t.title ?? tr('（未命名策展）')}</AppText>
                <AppText variant="caption" muted numberOfLines={1}>{tr('{store} · {n} 人在等', { store: t.store.name, n: t.waiting })}</AppText>
              </View>
              <Feather name="chevron-right" size={16} color={c.textTertiary} />
            </Pressable>
          ))}
        </ScrollView>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.xl, borderWidth: 1.5, borderStyle: 'dashed', padding: Spacing.lg, gap: Spacing.sm },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  hidden: { width: 52, height: 76, borderRadius: 3, opacity: 0.45, alignItems: 'center', justifyContent: 'center' },
  remind: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: Spacing.lg, borderRadius: Radius.md, borderWidth: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, paddingLeft: Spacing.md, paddingRight: Spacing.sm, minHeight: 46 },
  lineTag: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  soonRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.md },
  soonDot: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
});
