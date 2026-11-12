import { ListSkeleton } from '@/components/skeleton';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { AppText, Card, EmptyState, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { bookTitle, tr } from '@/lib/i18n';
import { FORMAT_LABEL, useMyPurchases, type PurchaseStatus } from '@/lib/purchases';

const STATUS = (): Record<PurchaseStatus, string> => ({ unread: tr('積讀'), reading: tr('正在讀'), done: tr('讀完了'), gone: tr('送人了／不讀了') });

/** 購書紀錄：所有買過的書（含已經在讀、讀完的）、每月本數、最常去的書店；金額只有自己看得到 */
export default function PurchasesScreen() {
  const c = useTheme();
  const { data, isPending } = useMyPurchases();
  if (isPending) return <ListSkeleton />;
  if (!data?.items.length) return <EmptyState title={tr('還沒有購書紀錄')} body={tr('買了一本書，按右下角的＋ › 買了一本書。')} actionLabel={tr('記一本買的書')} onAction={() => router.push('/purchase')} />;
  const max = Math.max(1, ...data.by_month.map((m) => m.n));
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md, paddingBottom: 48 }}>
        <Card style={styles.stats}>
          <View>
            <AppText style={styles.n}>{String(data.this_year)}</AppText>
            <AppText variant="caption" muted>{tr('今年買的')}</AppText>
          </View>
          <View>
            <AppText style={styles.n}>{String(data.unread)}</AppText>
            <AppText variant="caption" muted>{tr('還沒讀')}</AppText>
          </View>
          {data.spent_this_year ? (
            <View>
              <AppText style={styles.n}>{`$${data.spent_this_year.toLocaleString()}`}</AppText>
              <AppText variant="caption" muted>{tr('今年花費')}</AppText>
            </View>
          ) : null}
        </Card>
        {data.by_month.length ? (
          <Card style={{ gap: Spacing.sm }}>
            <AppText variant="label">{tr('每月買幾本')}</AppText>
            {data.by_month.slice(0, 6).map((m) => (
              <View key={m.month} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <AppText variant="caption" muted style={{ width: 64 }}>{m.month}</AppText>
                <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: c.divider }}>
                  <View style={{ width: `${(m.n / max) * 100}%`, height: 10, borderRadius: 5, backgroundColor: c.primary }} />
                </View>
                <AppText variant="caption" style={{ width: 24, textAlign: 'right' }}>{String(m.n)}</AppText>
              </View>
            ))}
            {data.top_places.length ? <AppText variant="caption" muted>{tr('最常買的地方：{list}', { list: data.top_places.map((p) => `${p.name}（${p.n}）`).join(tr('、')) })}</AppText> : null}
          </Card>
        ) : null}
        {data.items.map((p) => (
          <Pressable key={p.id} accessibilityRole="link" onPress={() => router.push({ pathname: '/book/[id]', params: { id: p.book_id } })}>
            <Card style={styles.row}>
              <BookCover title={p.book.title} url={p.book.cover_url} color="ochre" size="sm" />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label" numberOfLines={1}>{bookTitle(p.book.title)}</AppText>
                <AppText variant="caption" muted numberOfLines={1}>
                  {[p.bought_on, p.place_name ?? p.store_label, FORMAT_LABEL()[p.format], p.price != null ? `$${p.price}` : null].filter(Boolean).join(' · ')}
                </AppText>
              </View>
              <AppText variant="caption" style={{ color: p.status === 'unread' ? c.primary : c.textTertiary, fontWeight: '700' }}>{STATUS()[p.status]}</AppText>
            </Card>
          </Pressable>
        ))}
        <AppText variant="caption" style={{ color: c.textTertiary }}>{tr('金額只有你自己看得到。')}</AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: Spacing.xxl },
  n: { fontSize: 22, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
});
