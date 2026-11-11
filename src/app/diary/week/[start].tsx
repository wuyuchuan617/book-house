import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { Chip, TextField } from '@/components/form';
import { KindChip } from '@/components/note-card';
import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui';
import { WeekShareSheet } from '@/components/week-share';
import { MinTouch, Radius, Spacing, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { useSavedBooks } from '@/lib/browse';
import { tr } from '@/lib/i18n';
import { useMyStore } from '@/lib/queries';
import {
  isEmptyWeek,
  NEXT_BOOKS_MAX,
  REFLECTION_MAX,
  reflectionError,
  shareImageAvailable,
  useMarkWeekOpened,
  useSaveReflection,
  useWeekPhotoUrls,
  useWeekReview,
  weekLabel,
  weekStartOf,
  weekTitle,
  type WeekReview,
} from '@/lib/weekly';

/**
 * W2／W3 一週的回顧（只有自己看得到）：數字、書、金句、照片、去過的地方、書店，
 * 最後寫一句話、挑下週想讀。W4 分享圖。過去的回顧在 W5。
 */
export default function WeekReviewScreen() {
  const params = useLocalSearchParams<{ start: string; from?: string }>();
  const t = useTheme();
  const ws = weekStartOf(params.start);
  const { data: week, isLoading } = useWeekReview(ws);
  const { data: mine } = useMyStore();
  const mark = useMarkWeekOpened();
  const [shareOpen, setShareOpen] = useState(false);
  const marked = useRef(false);

  useEffect(() => {
    if (!week || marked.current) return;
    marked.current = true;
    track('weekly_review_opened', { from: params.from ?? 'push', empty: isEmptyWeek(week), current: week.is_current });
    if (!week.reflection.opened_at && !week.is_current) mark.mutate(ws);
  }, [week, ws, params.from, mark]);

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!week) return <EmptyState title={tr('沒有載入成功')} body={tr('檢查網路後再試一次。')} />;
  const color: StoreColor = mine?.store.color ?? 'clay';
  const empty = isEmptyWeek(week);

  return (
    <Screen>
      <Stack.Screen options={{ title: weekTitle(ws) }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText variant="caption" muted>{week.is_current ? tr('{range} · 還在進行中', { range: weekLabel(ws) }) : weekLabel(ws)}</AppText>
            <Pressable accessibilityRole="link" onPress={() => router.push('/diary/weeks')} hitSlop={8}>
              <AppText variant="caption" style={{ color: t.primary, fontWeight: '700' }}>{tr('過去的回顧')}</AppText>
            </Pressable>
          </View>

          {week.last_week_next.length ? <LastWeekNext items={week.last_week_next} color={color} /> : null}

          {empty ? (
            <EmptyWeek week={week} color={color} />
          ) : (
            <>
              <Numbers week={week} />
              {week.books.length ? <Books week={week} color={color} /> : null}
              {week.quotes.length ? <Quotes week={week} /> : null}
              {week.photos.length ? <Photos week={week} /> : null}
              {week.places.length ? <Places week={week} /> : null}
              {week.store && (week.store.visits || week.store.new_followers || week.store.saves) ? <StoreStats store={week.store} /> : null}
            </>
          )}

          <Reflection key={`${ws}-${week.reflection.body ?? ''}-${week.reflection.next_books.map((b) => b.id).join()}`} week={week} color={color} />

          {!empty && shareImageAvailable() ? (
            <Button kind="secondary" label={tr('做一張分享圖')} onPress={() => setShareOpen(true)} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      {!empty ? (
        <WeekShareSheet visible={shareOpen} onClose={() => setShareOpen(false)} week={week} store={mine ? { name: mine.store.name, slug: mine.store.slug, color: mine.store.color } : null} />
      ) : null}
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: Spacing.sm }}>
      <AppText variant="heading">{title}</AppText>
      {children}
    </View>
  );
}

function Numbers({ week }: { week: WeekReview }) {
  const t = useTheme();
  const names = [tr('一'), tr('二'), tr('三'), tr('四'), tr('五'), tr('六'), tr('日')];
  const stats: [string, number][] = [
    [tr('日記'), week.counts.notes],
    [tr('心得'), week.counts.reading_notes],
    [tr('打卡'), week.counts.checkins],
    [tr('想讀'), week.counts.saved],
  ];
  return (
    <Card style={{ gap: Spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm }}>
        <AppText style={{ fontSize: 40, fontWeight: '800', color: t.primary, lineHeight: 44 }}>{week.counts.active_days}</AppText>
        <AppText variant="label" style={{ marginBottom: 6 }}>{tr('天有閱讀')}</AppText>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {week.days.map((d, i) => (
          <View key={d.day} style={{ alignItems: 'center', gap: 4 }}>
            <View style={[styles.dot, { backgroundColor: d.active ? t.primary : 'transparent', borderColor: d.active ? t.primary : t.border }]}>
              {d.active ? <Feather name="check" size={14} color={t.onPrimary} /> : null}
            </View>
            <AppText variant="caption" style={{ fontSize: 11, color: t.textTertiary }}>{names[i]}</AppText>
          </View>
        ))}
      </View>
      <View style={[styles.statRow, { borderTopColor: t.divider }]}>
        {stats.map(([label, n]) => (
          <View key={label} style={{ flex: 1, alignItems: 'center' }}>
            <AppText style={{ fontSize: 18, fontWeight: '700' }}>{n}</AppText>
            <AppText variant="caption" muted>{label}</AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

function Books({ week, color }: { week: WeekReview; color: StoreColor }) {
  const t = useTheme();
  return (
    <Section title={tr('這週的書')}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.md }}>
        {week.books.map((b) => (
          <Pressable key={b.id} accessibilityRole="link" accessibilityLabel={b.title} onPress={() => router.push({ pathname: '/book/[id]', params: { id: b.id } })} style={{ width: 80, gap: 4 }}>
            <BookCover title={b.title} url={b.cover_url} color={color} size="md" />
            <AppText variant="caption" numberOfLines={2}>{b.title}</AppText>
            <AppText variant="caption" style={{ color: b.finished ? t.success : t.textTertiary, fontSize: 11, fontWeight: b.finished ? '700' : '500' }}>
              {b.finished ? tr('讀完') : b.started ? tr('開始讀') : tr('{n} 筆', { n: b.count })}
            </AppText>
          </Pressable>
        ))}
      </ScrollView>
      {week.counts.saved ? <AppText variant="caption" muted>{tr('另外加入了 {n} 本想讀', { n: week.counts.saved })}</AppText> : null}
    </Section>
  );
}

function Quotes({ week }: { week: WeekReview }) {
  const t = useTheme();
  return (
    <Section title={tr('本週金句')}>
      {week.quotes.map((q) => (
        <Pressable key={q.id} accessibilityRole="link" onPress={() => router.push({ pathname: '/reading/note/[id]', params: { id: q.id, readingId: q.reading_id } })}>
          <Card style={{ gap: 6 }}>
            {q.kind !== 'quote' ? <KindChip kind={q.kind} /> : null}
            <AppText style={{ fontFamily: q.kind === 'quote' ? 'serif' : undefined, fontSize: 16, lineHeight: 25 }} numberOfLines={6}>
              {q.kind === 'quote' ? tr('「{body}」', { body: q.body }) : q.body}
            </AppText>
            <AppText variant="caption" style={{ color: t.textSecondary }}>{[tr('《{title}》', { title: q.book_title }), q.page_ref].filter(Boolean).join(' · ')}</AppText>
          </Card>
        </Pressable>
      ))}
    </Section>
  );
}

function Photos({ week }: { week: WeekReview }) {
  const t = useTheme();
  const { data: urls } = useWeekPhotoUrls(week.photos);
  return (
    <Section title={tr('照片')}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {week.photos.map((p, i) => (
          <Image key={p.path} source={urls?.[i] ? { uri: urls[i]! } : undefined} style={[styles.photo, { backgroundColor: t.surfaceMuted }]} contentFit="cover" accessibilityLabel={tr('這週的照片 {n}', { n: i + 1 })} />
        ))}
      </View>
    </Section>
  );
}

function Places({ week }: { week: WeekReview }) {
  const t = useTheme();
  return (
    <Section title={tr('去過的地方')}>
      <Card style={{ paddingVertical: Spacing.sm }}>
        {week.places.map((p, i) => (
          <Pressable
            key={`${p.place_id ?? p.name}`}
            accessibilityRole={p.place_id ? 'link' : undefined}
            disabled={!p.place_id}
            onPress={() => p.place_id && router.push({ pathname: '/place/[id]', params: { id: p.place_id } })}
            style={[styles.placeRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.divider }]}>
            <Feather name="map-pin" size={16} color={t.primary} />
            <AppText style={{ flex: 1 }} numberOfLines={1}>{p.name}</AppText>
            <AppText variant="caption" muted>{tr('{n} 次', { n: p.count })}</AppText>
          </Pressable>
        ))}
      </Card>
    </Section>
  );
}

function StoreStats({ store }: { store: NonNullable<WeekReview['store']> }) {
  const stats: [string, number][] = [
    [tr('拜訪'), store.visits],
    [tr('新追蹤'), store.new_followers],
    [tr('被收藏'), store.saves],
  ];
  return (
    <Section title={tr('你的書店')}>
      <Card style={{ gap: Spacing.md }}>
        <View style={{ flexDirection: 'row' }}>
          {stats.map(([label, n]) => (
            <View key={label} style={{ flex: 1, alignItems: 'center' }}>
              <AppText style={{ fontSize: 20, fontWeight: '700' }}>{n}</AppText>
              <AppText variant="caption" muted>{label}</AppText>
            </View>
          ))}
        </View>
        {store.top_curation ? (
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/curation/[id]', params: { id: store.top_curation!.id } })}>
            <AppText variant="caption" muted>
              {tr('最多人看的策展：「{title}」，{n} 次拜訪', { title: store.top_curation.title, n: store.top_curation.visits })}
            </AppText>
          </Pressable>
        ) : null}
      </Card>
    </Section>
  );
}

function LastWeekNext({ items, color }: { items: WeekReview['last_week_next']; color: StoreColor }) {
  const t = useTheme();
  return (
    <Section title={tr('上週想讀的書，讀了嗎？')}>
      <Card style={{ gap: Spacing.sm }}>
        {items.map((b) => (
          <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
            <BookCover title={b.title} url={b.cover_url} color={color} size="sm" />
            <AppText style={{ flex: 1 }} numberOfLines={2}>{b.title}</AppText>
            <View style={[styles.badge, { backgroundColor: b.read ? t.successSurface : t.surfaceMuted }]}>
              <AppText variant="caption" style={{ color: b.read ? t.success : t.textSecondary, fontWeight: '700', fontSize: 11 }}>{b.read ? tr('讀了') : tr('還沒')}</AppText>
            </View>
          </View>
        ))}
      </Card>
    </Section>
  );
}

function EmptyWeek({ week, color }: { week: WeekReview; color: StoreColor }) {
  return (
    <Card style={{ alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl }}>
      <AppText variant="heading">{week.is_current ? tr('這週還沒有紀錄') : tr('這週休息了一下')}</AppText>
      <AppText muted style={{ textAlign: 'center' }}>{tr('想讀清單裡有一本在等你。讀幾頁，寫一句日記就好。')}</AppText>
      {week.suggestion ? (
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/book/[id]', params: { id: week.suggestion!.id } })} style={{ alignItems: 'center', gap: 6 }}>
          <BookCover title={week.suggestion.title} url={week.suggestion.cover_url} color={color} size="lg" />
          <AppText variant="label" numberOfLines={2} style={{ textAlign: 'center', maxWidth: 200 }}>{week.suggestion.title}</AppText>
        </Pressable>
      ) : null}
      <Button label={tr('寫日記')} style={{ alignSelf: 'stretch' }} onPress={() => router.push({ pathname: '/diary/compose', params: { kind: 'note' } })} />
    </Card>
  );
}

/** 一句話回顧＋下週想讀（從想讀清單挑 1–3 本）；只能在該週和下一週修改 */
function Reflection({ week, color }: { week: WeekReview; color: StoreColor }) {
  const t = useTheme();
  const saves = useSavedBooks();
  const save = useSaveReflection();
  const initialIds = week.reflection.next_books.map((b) => b.id);
  const [body, setBody] = useState(week.reflection.body ?? '');
  const [ids, setIds] = useState<string[]>(initialIds);
  const editable = week.reflection.editable;
  const dirty = body !== (week.reflection.body ?? '') || ids.join() !== initialIds.join();

  const want = (saves.data ?? []).map((s) => s.books);
  const options = [...week.reflection.next_books.filter((b) => !want.some((w) => w.id === b.id)), ...want].slice(0, 12);
  const toggle = (id: string) =>
    setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= NEXT_BOOKS_MAX ? cur : [...cur, id]));

  if (!editable) {
    if (!week.reflection.body && !week.reflection.next_books.length) return null;
    return (
      <Section title={tr('這週的一句話')}>
        <Card style={{ gap: Spacing.sm }}>
          {week.reflection.body ? <AppText style={{ lineHeight: 23 }}>{week.reflection.body}</AppText> : null}
          {week.reflection.next_books.length ? (
            <AppText variant="caption" muted>{tr('下週想讀：{titles}', { titles: week.reflection.next_books.map((b) => b.title).join(tr('、')) })}</AppText>
          ) : null}
        </Card>
      </Section>
    );
  }

  return (
    <Section title={tr('寫一句話給這一週')}>
      <TextField label={tr('一句話回顧')} optional multiline max={REFLECTION_MAX} value={body} onChangeText={setBody} placeholder={tr('這週讀得怎麼樣？')} />
      <View style={{ gap: Spacing.sm }}>
        <AppText variant="label">
          {tr('下週想讀')}
          <AppText variant="caption" muted>{tr('  從想讀清單挑 1–{n} 本', { n: NEXT_BOOKS_MAX })}</AppText>
        </AppText>
        {options.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
            {options.map((b) => (
              <Chip key={b.id} label={b.title.length > 16 ? `${b.title.slice(0, 16)}…` : b.title} selected={ids.includes(b.id)} disabled={!ids.includes(b.id) && ids.length >= NEXT_BOOKS_MAX} onPress={() => toggle(b.id)} />
            ))}
          </View>
        ) : (
          <AppText variant="caption" muted>{tr('想讀清單是空的。在書店頁按書籤，就能加入想讀。')}</AppText>
        )}
        {ids.length ? (
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            {ids.map((id) => {
              const b = options.find((o) => o.id === id);
              return b ? <BookCover key={id} title={b.title} url={b.cover_url} color={color} size="sm" /> : null;
            })}
          </View>
        ) : null}
      </View>
      <Button
        label={dirty ? tr('儲存') : tr('已儲存')}
        disabled={!dirty}
        loading={save.isPending}
        onPress={() =>
          save.mutate(
            { ws: week.week_start, body, nextBookIds: ids, prevNextIds: initialIds },
            { onError: (e) => Alert.alert(tr('沒有儲存成功'), reflectionError(e.message)) },
          )
        }
      />
      <AppText variant="caption" style={{ color: t.textTertiary }}>{tr('只有自己看得到。下一週結束前都可以修改。')}</AppText>
    </Section>
  );
}

const styles = StyleSheet.create({
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  statRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.md },
  photo: { width: '32%', aspectRatio: 1, borderRadius: 10 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: MinTouch },
  badge: { borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
});
