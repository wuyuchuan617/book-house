import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { AppText } from '@/components/ui';
import { Fonts, Radius, Spacing, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { friendlyError, useAddItem, useCreateCuration } from '@/lib/curations';
import { useMonthWrap } from '@/lib/flow';
import { tr } from '@/lib/i18n';
import { monthOf, taipeiToday } from '@/lib/period';

let dismissedFor: string | null = null;

/**
 * v1.9 AL6 月底：每月 25 號之後、下個月還沒有策展時，日記頁最上面一張卡——
 * 這個月讀的書排成下個月的策展（書帶入，推薦理由先帶寫過的心得第一句）。把每天的日記接到每月的策展。
 */
export function MonthWrapCard({ color = 'moss' }: { color?: StoreColor }) {
  const c = useTheme();
  const late = Number(taipeiToday().slice(8, 10)) >= 25;
  const { data } = useMonthWrap(late);
  const create = useCreateCuration();
  const add = useAddItem();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (!late || !data || data.next_has_curation || !data.books.length || hidden || dismissedFor === data.period) return null;
  const m = monthOf(data.period);
  const next = monthOf(data.next_period);

  const start = async () => {
    setBusy(true);
    try {
      const cur = await create.mutateAsync({ period: data.next_period });
      for (const b of data.books.slice(0, 20)) await add.mutateAsync({ curationId: cur.id, bookId: b.book_id, note: b.first_note?.slice(0, 120) ?? undefined });
      track('month_wrap_started', { books: data.books.length });
      router.push({ pathname: '/curation/[id]', params: { id: cur.id } });
    } catch (e) {
      Alert.alert(tr('沒有成功'), friendlyError((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: c.primary }]}>
      <AppText variant="caption" style={{ color: c.onPrimary, opacity: 0.85, fontWeight: '700' }}>{tr('{m} 月快結束了', { m })}</AppText>
      <AppText style={{ color: c.onPrimary, fontFamily: Fonts?.serif, fontSize: 18, lineHeight: 25, fontWeight: '700' }}>
        {data.notes ? tr('這個月你讀了 {n} 本、寫了 {k} 則心得', { n: data.books.length, k: data.notes }) : tr('這個月你讀了 {n} 本', { n: data.books.length })}
      </AppText>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {data.books.slice(0, 5).map((b) => <BookCover key={b.book_id} title={b.title} url={b.cover_url} color={color} size="sm" />)}
      </View>
      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void start()} style={[styles.btn, { flex: 1, backgroundColor: c.surface, opacity: busy ? 0.6 : 1 }]}>
          <AppText variant="label" style={{ color: c.primary }}>{tr('排成 {m} 月策展', { m: next })}</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            dismissedFor = data.period;
            setHidden(true);
          }}
          style={[styles.btn, { paddingHorizontal: Spacing.lg, borderWidth: 1, borderColor: c.onPrimary }]}>
          <AppText variant="label" style={{ color: c.onPrimary }}>{tr('之後再說')}</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.md },
  btn: { minHeight: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
});
