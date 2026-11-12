import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { NoteSnippet } from '@/components/note-card';
import { CurationView } from '@/components/curation-view';
import { IconButton } from '@/components/icon-button';
import { FollowButton } from '@/components/social';
import { CountLink, StoreHeader } from '@/components/store-header';
import { UnderlineTabs } from '@/components/underline-tabs';
import { StoreMenu } from '@/components/store-menu';
import { AppText, Card, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStoreReadings, type PublicReading } from '@/lib/browse';
import { currentPeriod, monthOf } from '@/lib/period';
import { recordVisit, useMyStore, usePublicStore } from '@/lib/queries';
import { shareStore } from '@/lib/links';
import { useStoreTbr } from '@/lib/store-v16';
import { bookTitle, tr } from '@/lib/i18n';
import { StoreRxTab } from '@/components/rx-explore';
import { StoreJournal } from '@/components/store-journal';
import { TeaserCard } from '@/components/teaser';
import { useStoreTeaser } from '@/lib/teaser';
import { SubChips, useVisitedPlaces, VisitedPlaces } from '@/components/store-lists';
import { useStoreJournal } from '@/lib/diary';
import { TripCard } from '@/components/trips';
import { useStoreTrips } from '@/lib/trips';

type Tab = 'curation' | 'reading' | 'journal' | 'want' | 'place' | 'rx';

const openBook = (id: string) => router.push({ pathname: '/book/[id]', params: { id } });

/**
 * A3 書店頁（策展）、A4 書店頁（店主閱讀）、A6 更多操作（分享、複製連結、檢舉、封鎖）。
 * v1.7.2 AA5：跟我的書店同一套精簡資訊與固定分頁；想讀（想讀＋積讀）、想去分開；店主沒公開的分頁不顯示。
 */
export default function StoreScreen() {
  const { slug, tab: tabParam } = useLocalSearchParams<{ slug: string; tab?: string }>();
  const initialTab = (tabParam === 'lists' ? 'want' : tabParam) as Tab | undefined;
  const c = useTheme();
  const { data, isLoading } = usePublicStore(slug);
  const { data: mine } = useMyStore();
  const [tab, setTab] = useState<Tab>(initialTab && ['reading', 'journal', 'want', 'place', 'rx'].includes(initialTab) ? initialTab : 'curation');
  const [index, setIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const current = data?.curations[index];
  const { data: readings } = useStoreReadings(data?.store.id);
  const [wantSub, setWantSub] = useState<'want' | 'tbr'>('want');
  const [placeSub, setPlaceSub] = useState<'want' | 'visited' | 'trips'>('want');
  const trips = useStoreTrips(slug, data?.store.show_trip !== false);
  const journal = useStoreJournal(data?.store.id);
  const teaser = useStoreTeaser(slug);
  const visited = useVisitedPlaces(data?.store.id);
  const tbr = useStoreTbr(data?.store.show_owned ? data.store.slug : undefined);

  useEffect(() => {
    if (current) void recordVisit(current.id);
  }, [current]);

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!data) return <EmptyState title={tr('找不到這間書店')} body={tr('它可能暫停營業或已經關閉。')} actionLabel={tr('回探索')} onAction={() => router.navigate('/')} />;

  const { store, curations } = data;
  const isMine = mine?.store.id === store.id;
  // 公開設定把「正在讀／讀過」關掉 → 不顯示店主閱讀分頁
  const tabs: Tab[] = [
    'curation',
    ...(store.show_reading === false ? [] : (['reading'] as Tab[])),
    ...(store.show_post ? (['journal'] as Tab[]) : []),
    ...(store.show_want || store.show_owned ? (['want'] as Tab[]) : []),
    ...(store.show_place || (trips.data?.length ?? 0) > 0 ? (['place'] as Tab[]) : []),
    ...(store.show_rx ? (['rx'] as Tab[]) : []),
  ];
  const LABEL: Record<Tab, string> = { curation: tr('策展'), reading: tr('閱讀'), journal: tr('手記'), want: tr('想讀'), place: tr('地點'), rx: tr('處方箋') };
  const shown: Tab = tabs.includes(tab) ? tab : 'curation';
  const count = (t: 'want' | 'place') => (journal.data ?? []).filter((i) => i.type === t).length;
  // 想讀分頁：想讀（公開設定「想讀」）｜積讀（「積讀」），只放有開的
  const wantOpts: ['want' | 'tbr', string][] = [
    ...(store.show_want ? [['want', tr('想讀 · {n}', { n: count('want') })] as ['want', string]] : []),
    ...(store.show_owned ? [['tbr', tr('積讀 · {n}', { n: tbr.data?.length ?? 0 })] as ['tbr', string]] : []),
  ];
  // 地點分頁：想去｜去過（公開設定「想去」）｜書旅（「書旅」，有才放）
  const placeOpts: ['want' | 'visited' | 'trips', string][] = [
    ...(store.show_place ? ([['want', tr('想去 · {n}', { n: count('place') })], ['visited', tr('去過 · {n}', { n: visited.places.length })]] as ['want' | 'visited', string][]) : []),
    ...((trips.data?.length ?? 0) > 0 ? [['trips', tr('書旅 · {n}', { n: trips.data!.length })] as ['trips', string]] : []),
  ];
  const placeShown = placeOpts.some(([k]) => k === placeSub) ? placeSub : placeOpts[0]?.[0] ?? 'want';
  const wantShown = wantOpts.some(([k]) => k === wantSub) ? wantSub : wantOpts[0]?.[0] ?? 'want';

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} stickyHeaderIndices={[1]}>
        <StoreHeader
          store={store}
          buttons={
            <>
              <IconButton icon="chevron-left" label={tr('返回')} onImage onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} />
              <View style={{ flex: 1 }} />
              <IconButton icon="share" label={tr('分享書店')} onImage onPress={() => shareStore(store.name, store.slug)} />
              <IconButton icon="more-horizontal" label={tr('更多操作')} onImage onPress={() => setMenuOpen(true)} />
            </>
          }
          meta={
            <>
              <CountLink n={store.follower_count} label={tr('追蹤者')} />
              <AppText variant="caption" muted numberOfLines={1} style={{ flexShrink: 1 }}>{tr('店主 {name}', { name: store.owner_name })}</AppText>
            </>
          }
          actions={isMine ? null : <FollowButton bookstoreId={store.id} storeName={store.name} />}
        />

        <UnderlineTabs tabs={tabs.map((t) => [t, LABEL[t]] as [Tab, string])} value={shown} onChange={setTab} />

        {shown === 'curation' && teaser.data ? (
          <View style={{ paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl }}>
            <TeaserCard teaser={teaser.data} mine={isMine} />
          </View>
        ) : null}
        {shown === 'curation' ? (
          curations.length === 0 ? (
            teaser.data ? null : <Centered><EmptyState title={tr('這間書店還沒有策展')} body={tr('追蹤後，新策展上架時會通知你。')} /></Centered>
          ) : (
            <View style={{ padding: Spacing.xl, gap: Spacing.lg }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
                {curations.map((cur, i) => (
                  <Pressable
                    key={cur.id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: i === index }}
                    onPress={() => setIndex(i)}
                    style={[styles.pill, { backgroundColor: i === index ? c.primary : c.surface, borderColor: c.border }]}>
                    <AppText variant="caption" style={{ color: i === index ? c.onPrimary : c.text, fontWeight: '700' }}>
                      {tr('{p0} 月{p1}', { p0: monthOf(cur.period), p1: cur.period === currentPeriod() ? tr(' · 本月') : '' })}
                    </AppText>
                  </Pressable>
                ))}
              </ScrollView>
              {current ? (
                <CurationView
                  title={current.title}
                  description={current.description}
                  items={current.curation_items}
                  color={store.color}
                  interactive={{ curationId: current.id, bookstoreId: store.id, onOpenBook: openBook }}
                />
              ) : null}
            </View>
          )
        ) : shown === 'reading' ? (
          <ReadingTab readings={readings} color={store.color} />
        ) : shown === 'journal' ? (
          <View style={{ padding: Spacing.xl }}>
            <StoreJournal bookstoreId={store.id} color={store.color} scope="posts" />
          </View>
        ) : shown === 'want' ? (
          <View style={{ padding: Spacing.xl, gap: Spacing.md }}>
            <SubChips options={wantOpts} value={wantShown} onChange={setWantSub} />
            {wantShown === 'want' ? <StoreJournal bookstoreId={store.id} color={store.color} scope="want" /> : <StoreTbr slug={store.slug} color={store.color} />}
          </View>
        ) : shown === 'place' ? (
          <View style={{ padding: Spacing.xl, gap: Spacing.md }}>
            <SubChips
              options={placeOpts}
              value={placeShown}
              onChange={setPlaceSub}
            />
            {placeShown === 'want' ? (
              <StoreJournal bookstoreId={store.id} color={store.color} scope="place" />
            ) : placeShown === 'visited' ? (
              <VisitedPlaces bookstoreId={store.id} />
            ) : (
              (trips.data ?? []).map((t) => <TripCard key={t.id} t={t} />)
            )}
          </View>
        ) : (
          <View style={{ padding: Spacing.xl }}>
            <StoreRxTab slug={store.slug} />
          </View>
        )}
      </ScrollView>
      <StoreMenu store={store} visible={menuOpen} onClose={() => setMenuOpen(false)} isMine={isMine} />
    </Screen>
  );
}

/** A4 店主閱讀（讀者唯讀）：正在讀＋讀完了 */
function ReadingTab({ readings, color }: { readings: PublicReading[] | undefined; color: StoreColor }) {
  const c = useTheme();
  const [showAll, setShowAll] = useState(false);
  if (!readings) return <ActivityIndicator style={{ marginTop: 32 }} />;
  if (readings.length === 0) return <Centered><EmptyState title={tr('店主還沒有公開的閱讀紀錄')} body={tr('店主記下正在讀的書後，會出現在這裡。')} /></Centered>;

  const reading = readings.filter((r) => r.status === 'reading');
  const finished = readings.filter((r) => r.status === 'finished');
  const shown = showAll ? finished : finished.slice(0, 3);
  const open = (id: string) => router.push({ pathname: '/reading/[id]', params: { id } });

  return (
    <View style={{ padding: Spacing.xl, gap: Spacing.lg }}>
      {reading.length ? (
        <View style={{ gap: Spacing.sm }}>
          <AppText variant="label">{tr('正在讀 · {length}', { length: reading.length })}</AppText>
          <Card style={{ gap: Spacing.lg }}>
            {reading.map((r) => {
              const [latest, ...older] = r.reading_notes;
              return (
                <Pressable key={r.id} accessibilityRole="link" onPress={() => open(r.id)} style={{ flexDirection: 'row', gap: Spacing.md }}>
                  <BookCover title={r.books.title} url={r.books.cover_url} color={color} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="label">{bookTitle(r.books.title)}</AppText>
                    <AppText variant="caption" muted>{r.books.authors.join(tr('、'))}</AppText>
                    {latest ? <NoteSnippet note={latest} /> : null}
                    {older.length ? <AppText variant="caption" style={{ color: c.primary, marginTop: 2 }}>{tr('還有 {length} 則心得', { length: older.length })}</AppText> : null}
                  </View>
                  <Feather name="chevron-right" size={16} color={c.textTertiary} />
                </Pressable>
              );
            })}
          </Card>
        </View>
      ) : null}

      {finished.length ? (
        <View style={{ gap: Spacing.sm }}>
          <AppText variant="label">{tr('讀完了 · {length}', { length: finished.length })}</AppText>
          <View style={styles.grid}>
            {shown.map((r) => (
              <Pressable key={r.id} accessibilityRole="link" accessibilityLabel={r.books.title} onPress={() => open(r.id)} style={{ width: 80, gap: 4 }}>
                <BookCover title={r.books.title} url={r.books.cover_url} color={color} size="lg" />
                <AppText variant="caption" numberOfLines={2}>{bookTitle(r.books.title)}</AppText>
              </Pressable>
            ))}
            {!showAll && finished.length > 3 ? (
              <Pressable accessibilityRole="button" onPress={() => setShowAll(true)} style={[styles.more, { backgroundColor: c.surfaceMuted }]}>
                <AppText variant="label">{`+${finished.length - 3}`}</AppText>
                <AppText variant="caption" muted>{tr('看全部')}</AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** 沒有資料時放在分頁下方剩餘空間的中間（Y3） */
function Centered({ children }: { children: React.ReactNode }) {
  return <View style={{ minHeight: 360, justifyContent: 'center' }}>{children}</View>;
}

/** 書店頁 › 想讀 › 積讀（店主公開設定打開才有；不顯示金額、在哪買） */
function StoreTbr({ slug, color }: { slug: string; color: StoreColor }) {
  const { data } = useStoreTbr(slug);
  if (!data) return <ActivityIndicator style={{ marginTop: 32 }} />;
  if (!data.length) return <Centered><EmptyState title={tr('店主沒有公開的積讀')} body={tr('店主買了還沒讀的書會出現在這裡。')} /></Centered>;
  return (
    <View style={{ gap: Spacing.sm }}>
      <View style={styles.grid}>
        {data.map((b) => (
          <Pressable key={b.book_id} accessibilityRole="link" accessibilityLabel={b.title} onPress={() => openBook(b.book_id)} style={{ width: 80, gap: 4 }}>
            <BookCover title={b.title} url={b.cover_url} color={color} size="lg" />
            <AppText variant="caption" numberOfLines={2}>{bookTitle(b.title)}</AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { minHeight: MinTouch, paddingHorizontal: 14, borderRadius: Radius.pill, borderWidth: 1, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  more: { width: 80, height: 120, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
});
