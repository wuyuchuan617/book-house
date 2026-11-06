import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { CurationView } from '@/components/curation-view';
import { FollowButton, StoreAvatar } from '@/components/social';
import { StoreMenu } from '@/components/store-menu';
import { AppText, Card, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing, StoreColors, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStoreReadings, type PublicReading } from '@/lib/browse';
import { currentPeriod, monthOf, timeAgo } from '@/lib/period';
import { recordVisit, useMyStore, usePublicStore } from '@/lib/queries';

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
  if (!data) return <EmptyState title="找不到這間書店" body="它可能暫停營業或已經關閉。" actionLabel="回探索" onAction={() => router.navigate('/')} />;

  const { store, curations } = data;
  const isMine = mine?.store.id === store.id;

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: store.name,
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="更多操作" onPress={() => setMenuOpen(true)} style={styles.headerBtn}>
              <Feather name="more-horizontal" size={22} color={c.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[styles.hero, { backgroundColor: StoreColors[store.color].hex }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
            <View style={styles.avatarRing}>
              <StoreAvatar name={store.name} color={store.color} size={52} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="heading" style={{ color: '#FFFFFF' }}>{store.name}</AppText>
              <AppText variant="caption" style={{ color: '#FFFFFF' }}>{`店主 ${store.owner_name} · ${store.follower_count} 人追蹤`}</AppText>
            </View>
            {isMine ? null : <FollowButton bookstoreId={store.id} storeName={store.name} onColor />}
          </View>
          {store.tagline ? <AppText style={{ color: '#FFFFFF', marginTop: Spacing.md }}>{store.tagline}</AppText> : null}
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
                  {t === 'curation' ? '策展' : '店主閱讀'}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {tab === 'curation' ? (
          curations.length === 0 ? (
            <EmptyState title="這間書店還沒有策展" body="追蹤後，新策展上架時會通知你。" />
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
                      {`${monthOf(cur.period)} 月${cur.period === currentPeriod() ? ' · 本月' : ''}`}
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
  if (readings.length === 0) return <EmptyState title="店主還沒有公開的閱讀紀錄" body="店主記下正在讀的書後，會出現在這裡。" />;

  const reading = readings.filter((r) => r.status === 'reading');
  const finished = readings.filter((r) => r.status === 'finished');
  const shown = showAll ? finished : finished.slice(0, 3);
  const open = (id: string) => router.push({ pathname: '/reading/[id]', params: { id } });

  return (
    <View style={{ padding: Spacing.xl, gap: Spacing.lg }}>
      {reading.length ? (
        <View style={{ gap: Spacing.sm }}>
          <AppText variant="label">{`正在讀 · ${reading.length}`}</AppText>
          <Card style={{ gap: Spacing.lg }}>
            {reading.map((r) => {
              const [latest, ...older] = r.reading_notes;
              return (
                <Pressable key={r.id} accessibilityRole="link" onPress={() => open(r.id)} style={{ flexDirection: 'row', gap: Spacing.md }}>
                  <BookCover title={r.books.title} url={r.books.cover_url} color={color} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="label">{r.books.title}</AppText>
                    <AppText variant="caption" muted>{r.books.authors.join('、')}</AppText>
                    {latest ? (
                      <AppText variant="caption" style={{ marginTop: 4, lineHeight: 19 }} numberOfLines={3}>
                        {`「${latest.body}」`}
                        <AppText variant="caption" muted>{` · ${timeAgo(latest.created_at)}`}</AppText>
                      </AppText>
                    ) : null}
                    {older.length ? <AppText variant="caption" style={{ color: c.primary, marginTop: 2 }}>{`還有 ${older.length} 則心得`}</AppText> : null}
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
          <AppText variant="label">{`讀完了 · ${finished.length}`}</AppText>
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
                <AppText variant="caption" muted>看全部</AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerBtn: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center' },
  hero: { padding: Spacing.xl },
  avatarRing: { borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', padding: 2 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.xl },
  tab: { minHeight: MinTouch + 4, paddingHorizontal: Spacing.md, justifyContent: 'center', borderBottomWidth: 2.5, marginRight: Spacing.md },
  pill: { minHeight: MinTouch, paddingHorizontal: 14, borderRadius: Radius.pill, borderWidth: 1, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  more: { width: 80, height: 120, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
});
