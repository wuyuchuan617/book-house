import Feather from '@expo/vector-icons/Feather';
import { Image, type ImageStyle } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { NoteSnippet } from '@/components/note-card';
import { CurationView } from '@/components/curation-view';
import { FollowButton, StoreAvatar } from '@/components/social';
import { StoreMenu } from '@/components/store-menu';
import { AppText, Card, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing, StoreColors, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStoreReadings, type PublicReading } from '@/lib/browse';
import { currentPeriod, monthOf } from '@/lib/period';
import { recordVisit, useMyStore, usePublicStore } from '@/lib/queries';
import { storageUrl } from '@/lib/uploads';
import { tr } from '@/lib/i18n';

type Tab = 'curation' | 'reading';

const openBook = (id: string) => router.push({ pathname: '/book/[id]', params: { id } });

/** A3 書店頁（策展）、A4 書店頁（店主閱讀）、A6 更多操作（分享、複製連結、檢舉、封鎖） */
export default function StoreScreen() {
  const { slug, tab: initialTab } = useLocalSearchParams<{ slug: string; tab?: Tab }>();
  const c = useTheme();
  const { data, isLoading } = usePublicStore(slug);
  const { data: mine } = useMyStore();
  const [tab, setTab] = useState<Tab>(initialTab === 'reading' ? 'reading' : 'curation');
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

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: store.name,
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={tr('更多操作')} onPress={() => setMenuOpen(true)} style={styles.headerBtn}>
              <Feather name="more-horizontal" size={22} color={c.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* A3/A4 Hero 區塊 */}
        <View style={[styles.hero, { backgroundColor: StoreColors[store.color].hex }]}>
          {banner ? <Image source={{ uri: banner }} style={StyleSheet.absoluteFill as ImageStyle} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
          {banner ? (
            <LinearGradient
              colors={['rgba(31,27,22,0.15)', 'rgba(31,27,22,0.55)', 'rgba(31,27,22,0.7)']}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
            />
          ) : null}

          {/* 頭貼 + 店名/店主資訊 */}
          <View style={styles.heroHeader}>
            <View style={styles.avatarRing}>
              <StoreAvatar name={store.name} color={store.color} size={64} path={store.avatar_path} />
            </View>
            <View style={styles.heroInfo}>
              <AppText variant="title" style={styles.heroTitle}>{store.name}</AppText>
              <AppText variant="caption" style={styles.heroCaption}>
                {tr('店主 {owner_name} · {follower_count} 人追蹤', { owner_name: store.owner_name, follower_count: store.follower_count })}
              </AppText>
            </View>
          </View>

          {/* 店家介紹 */}
          {store.tagline ? (
            <AppText style={styles.heroTagline}>{store.tagline}</AppText>
          ) : null}

          {/* 追蹤按鈕 */}
          {isMine ? null : (
            <View style={styles.heroAction}>
              <FollowButton bookstoreId={store.id} storeName={store.name} onColor />
            </View>
          )}
        </View>

        <View style={[styles.tabs, { borderBottomColor: c.border }]} accessibilityRole="tablist">
          {(['curation', 'reading'] as Tab[]).map((t) => {
            const selected = tab === t;
            return (
              <Pressable
                key={t}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setTab(t)}
                style={[styles.tab, { borderBottomColor: selected ? c.primary : 'transparent' }]}>
                <AppText style={{ fontWeight: selected ? '700' : '500', color: selected ? c.text : c.textSecondary }}>
                  {t === 'curation' ? tr('策展') : tr('店主閱讀')}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {tab === 'curation' ? (
          curations.length === 0 ? (
            <EmptyState title={tr('這間書店還沒有策展')} body={tr('追蹤後，新策展上架時會通知你。')} />
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
        ) : (
          <ReadingTab readings={readings} color={store.color} />
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
  if (readings.length === 0) return <EmptyState title={tr('店主還沒有公開的閱讀紀錄')} body={tr('店主記下正在讀的書後，會出現在這裡。')} />;

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

const AVATAR_SIZE = 64;
const AVATAR_RING_PADDING = 3;

const styles = StyleSheet.create({
  headerBtn: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center' },

  hero: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
    overflow: 'hidden',
    gap: Spacing.lg,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  avatarRing: {
    borderRadius: (AVATAR_SIZE + AVATAR_RING_PADDING * 2) * 0.3,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.7)',
    padding: AVATAR_RING_PADDING,
  },
  heroInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  heroTitle: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroCaption: {
    color: 'rgba(255,255,255,0.9)',
  },
  heroTagline: {
    color: '#FFFFFF',
    lineHeight: 22,
  },
  heroAction: {
    marginTop: Spacing.xs,
  },

  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.xl },
  tab: { minHeight: MinTouch + 4, paddingHorizontal: Spacing.md, justifyContent: 'center', borderBottomWidth: 2.5, marginRight: Spacing.md },
  pill: { minHeight: MinTouch, paddingHorizontal: 14, borderRadius: Radius.pill, borderWidth: 1, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  more: { width: 80, height: 120, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
});
