import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { NoteSnippet } from '@/components/note-card';
import { CurationView } from '@/components/curation-view';
import { IconButton } from '@/components/icon-button';
import { FollowButton, StoreAvatar } from '@/components/social';
import { UnderlineTabs } from '@/components/underline-tabs';
import { StoreMenu } from '@/components/store-menu';
import { AppText, Card, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing, StoreColors, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStoreReadings, type PublicReading } from '@/lib/browse';
import { currentPeriod, monthOf } from '@/lib/period';
import { recordVisit, useMyStore, usePublicStore } from '@/lib/queries';
import { storageUrl } from '@/lib/uploads';
import { shareStore } from '@/lib/links';
import { useStoreTbr } from '@/lib/store-v16';
import { tr } from '@/lib/i18n';
import { StoreRxTab } from '@/components/rx-explore';
import { StoreJournal } from '@/components/store-journal';

type Tab = 'curation' | 'reading' | 'journal' | 'lists' | 'rx';

const openBook = (id: string) => router.push({ pathname: '/book/[id]', params: { id } });

/** A3 書店頁（策展）、A4 書店頁（店主閱讀）、A6 更多操作（分享、複製連結、檢舉、封鎖） */
export default function StoreScreen() {
  const { slug, tab: initialTab } = useLocalSearchParams<{ slug: string; tab?: Tab }>();
  const c = useTheme();
  const { data, isLoading } = usePublicStore(slug);
  const { data: mine } = useMyStore();
  const [tab, setTab] = useState<Tab>(initialTab && ['reading', 'journal', 'lists', 'rx'].includes(initialTab) ? initialTab : 'curation');
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const current = data?.curations[index];
  const { data: readings } = useStoreReadings(data?.store.id);

  useEffect(() => {
    if (current) void recordVisit(current.id);
  }, [current]);

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!data) return <EmptyState title={tr('找不到這間書店')} body={tr('它可能暫停營業或已經關閉。')} actionLabel={tr('回探索')} onAction={() => router.navigate('/')} />;

  const { store, curations } = data;
  const isMine = mine?.store.id === store.id;
  const banner = storageUrl('banner', store.banner_path);
  // 公開設定把「正在讀／讀過」關掉 → 不顯示店主閱讀分頁
  const tabs: Tab[] = [
    'curation',
    ...(store.show_reading === false ? [] : (['reading'] as Tab[])),
    ...(store.show_post ? (['journal'] as Tab[]) : []),
    ...(store.show_want || store.show_place || store.show_owned ? (['lists'] as Tab[]) : []),
    ...(store.show_rx ? (['rx'] as Tab[]) : []),
  ];
  const LABEL: Record<Tab, string> = { curation: tr('策展'), reading: tr('店主閱讀'), journal: tr('手記'), lists: tr('想讀想去'), rx: tr('處方簽') };
  const shown: Tab = tabs.includes(tab) ? tab : 'curation';

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} stickyHeaderIndices={[2]}>
        {/* Y3 背景圖從螢幕最上方開始；返回、分享、⋯ 是白色圓底按鈕 */}
        <View style={[styles.banner, { height: 120 + insets.top, backgroundColor: StoreColors[store.color].hex }]}>
          {banner ? <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.12)' }]} />}
          <View style={styles.bannerShade} />
          <View style={[styles.topRow, { top: insets.top + 8 }]}>
            <IconButton icon="chevron-left" label={tr('返回')} onImage onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} />
            <View style={{ flex: 1 }} />
            <IconButton icon="share" label={tr('分享書店')} onImage onPress={() => shareStore(store.name, store.slug)} />
            <IconButton icon="more-horizontal" label={tr('更多操作')} onImage onPress={() => setMenuOpen(true)} />
          </View>
          <View style={styles.identity}>
            <View style={[styles.avatarRing, { borderColor: c.background }]}>
              <StoreAvatar name={store.name} color={store.color} size={56} path={store.avatar_path} />
            </View>
            <AppText numberOfLines={1} style={styles.name}>{store.name}</AppText>
          </View>
        </View>

        <View style={{ paddingHorizontal: Spacing.xl, paddingTop: 34, paddingBottom: Spacing.sm, gap: Spacing.sm }}>
          {store.tagline ? <AppText variant="caption" muted>{store.tagline}</AppText> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <AppText variant="caption" muted style={{ flex: 1 }}>{tr('店主 {owner_name} · {follower_count} 人追蹤', { owner_name: store.owner_name, follower_count: store.follower_count })}</AppText>
            {isMine ? null : <FollowButton bookstoreId={store.id} storeName={store.name} />}
          </View>
        </View>

        <UnderlineTabs tabs={tabs.map((t) => [t, LABEL[t]] as [Tab, string])} value={shown} onChange={setTab} />

        {shown === 'curation' ? (
          curations.length === 0 ? (
            <Centered><EmptyState title={tr('這間書店還沒有策展')} body={tr('追蹤後，新策展上架時會通知你。')} /></Centered>
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
        ) : shown === 'lists' ? (
          <View style={{ padding: Spacing.xl, gap: Spacing.lg }}>
            {store.show_want || store.show_place ? <StoreJournal bookstoreId={store.id} color={store.color} scope="lists" /> : null}
            {store.show_owned ? <StoreTbr slug={store.slug} color={store.color} /> : null}
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
                    <AppText variant="label">{r.books.title}</AppText>
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
                <AppText variant="caption" numberOfLines={2}>{r.books.title}</AppText>
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

/** 書店頁 › 想讀想去 › 積讀（店主公開設定打開才有；不顯示金額、在哪買） */
function StoreTbr({ slug, color }: { slug: string; color: StoreColor }) {
  const { data } = useStoreTbr(slug);
  if (!data?.length) return null;
  return (
    <View style={{ gap: Spacing.sm }}>
      <AppText variant="label">{tr('積讀 · {n}', { n: data.length })}</AppText>
      <View style={styles.grid}>
        {data.map((b) => (
          <Pressable key={b.book_id} accessibilityRole="link" accessibilityLabel={b.title} onPress={() => openBook(b.book_id)} style={{ width: 80, gap: 4 }}>
            <BookCover title={b.title} url={b.cover_url} color={color} size="lg" />
            <AppText variant="caption" numberOfLines={2}>{b.title}</AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'relative', zIndex: 2 },
  bannerShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 60, backgroundColor: 'rgba(0,0,0,0.18)' },
  topRow: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', gap: 8 },
  identity: { position: 'absolute', left: Spacing.xl, right: Spacing.xl, bottom: -24, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  avatarRing: { borderWidth: 3, borderRadius: 18 },
  name: { flex: 1, color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginBottom: 30, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 },
  pill: { minHeight: MinTouch, paddingHorizontal: 14, borderRadius: Radius.pill, borderWidth: 1, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  more: { width: 80, height: 120, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
});
