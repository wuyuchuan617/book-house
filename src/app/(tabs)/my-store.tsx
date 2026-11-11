import Feather from '@expo/vector-icons/Feather';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { IconButton } from '@/components/icon-button';
import { OwnerRx } from '@/components/rx-mine';
import { CountLink, SmallButton, StoreHeader } from '@/components/store-header';
import { UnderlineTabs } from '@/components/underline-tabs';
import { StoreJournal } from '@/components/store-journal';
import { StoreSetupSheet } from '@/components/store-setup';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { Radius, Spacing, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { CurationSection } from '@/components/my-curations';
import { ReadingRemovalToast, ReadingSection, useReadingRemoval } from '@/components/my-readings';
import { useMyReadings } from '@/lib/readings';
import { useMyStore, type StoreShow } from '@/lib/queries';
import { shareStore } from '@/lib/links';
import { tr } from '@/lib/i18n';
import { useMyPurchases } from '@/lib/purchases';
import { useStoreInsights } from '@/lib/store-v16';

type Tab = 'curation' | 'reading' | 'journal' | 'want' | 'place' | 'rx';
const TAB_KEYS: Tab[] = ['curation', 'reading', 'journal', 'want', 'place', 'rx'];

/**
 * W1 我的書店（v1.7.2 AA1–AA4）：精簡的書店資訊（背景圖變矮、名字在圖下面、追蹤數一行字、編輯／數據／讀者視角／分享是小按鈕，右上只留設定）；
 * 固定 6 格分頁 策展｜閱讀｜手記｜想讀｜想去｜處方簽（不放數字，往下捲黏在最上面）。
 * 自己看得到全部分頁；公開設定沒開的那一類，最上面一條「讀者看不到」。第一次進來跳出 G0 設定卡。
 */
export default function MyStoreScreen() {
  const { session, requireAuth } = useAuth();
  const { data, isLoading } = useMyStore();
  const readings = useMyReadings();
  const removal = useReadingRemoval();
  const params = useLocalSearchParams<{ tab?: string }>();
  const initial = params.tab === 'lists' ? 'want' : params.tab;
  const [tab, setTab] = useState<Tab>(TAB_KEYS.includes(initial as Tab) ? (initial as Tab) : 'curation');
  const insights = useStoreInsights();

  if (!session) {
    return (
      <Screen>
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <AppText variant="title">{tr('我的書店')}</AppText>
          </View>
          <EmptyState title={tr('每個人都有一間小書店')} body={tr('登入後就有你的書店：放推薦的書、正在讀的書。')} actionLabel={tr('登入')} onAction={() => requireAuth(() => undefined)} />
        </SafeAreaView>
      </Screen>
    );
  }

  if (isLoading || !data) {
    return (
      <Screen>
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          {isLoading ? <ActivityIndicator style={{ marginTop: 48 }} /> : <EmptyState title={tr('書店暫時打不開')} body={tr('帳號正在刪除中，或網路有點問題。下拉或稍後再試一次。')} />}
        </SafeAreaView>
      </Screen>
    );
  }

  const { store, stats } = data;
  const followers = insights.data?.followers ?? stats?.follower_count ?? 0;
  const following = insights.data?.following ?? 0;
  const TABS: [Tab, string][] = [
    ['curation', tr('策展')],
    ['reading', tr('閱讀')],
    ['journal', tr('手記')],
    ['want', tr('想讀')],
    ['place', tr('想去')],
    ['rx', tr('處方簽')],
  ];
  // 讀者看不到的分頁（公開設定沒開）
  const hidden: Partial<Record<Tab, [keyof StoreShow, string]>> = {
    reading: ['show_reading', tr('閱讀')],
    journal: ['show_post', tr('手記')],
    want: ['show_want', tr('想讀')],
    place: ['show_place', tr('想去')],
    rx: ['show_rx', tr('處方簽')],
  };
  const off = hidden[tab] && store[hidden[tab]![0]] === false ? hidden[tab]![1] : null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} stickyHeaderIndices={[1]}>
        <StoreHeader
          store={store}
          buttons={
            <>
              <View style={{ flex: 1 }} />
              <IconButton icon="settings" label={tr('設定')} onImage onPress={() => router.push('/settings')} />
            </>
          }
          meta={
            <>
              <CountLink n={followers} label={tr('追蹤者')} onPress={() => router.push({ pathname: '/follows', params: { kind: 'followers' } })} />
              <CountLink n={following} label={tr('追蹤中')} onPress={() => router.push({ pathname: '/follows', params: { kind: 'following' } })} />
            </>
          }
          actions={
            <>
              <SmallButton icon="edit-2" label={tr('編輯')} showLabel onPress={() => router.push('/store-edit')} />
              <SmallButton icon="bar-chart-2" label={tr('數據')} onPress={() => router.push('/store-insights')} />
              <SmallButton icon="eye" label={tr('讀者視角')} onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: store.slug } })} />
              <SmallButton icon="share" label={tr('分享')} onPress={() => shareStore(store.name, store.slug)} />
            </>
          }
        />

        <UnderlineTabs tabs={TABS} value={tab} onChange={setTab} />

        <View style={{ paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.md }}>
          {off ? <HiddenBar what={off} /> : null}
          {tab === 'curation' ? (
            <CurationSection />
          ) : tab === 'reading' ? (
            <ReadingSection readings={readings.data} loading={readings.isLoading} color={store.color} removal={removal} />
          ) : tab === 'journal' ? (
            <StoreJournal bookstoreId={store.id} color={store.color} mine scope="posts" />
          ) : tab === 'want' ? (
            <>
              <StoreJournal bookstoreId={store.id} color={store.color} mine scope="want" />
              <OwnerTbr color={store.color} hiddenFromReaders={store.show_owned === false} />
            </>
          ) : tab === 'place' ? (
            <StoreJournal bookstoreId={store.id} color={store.color} mine scope="place" />
          ) : (
            <OwnerRx />
          )}
        </View>
      </ScrollView>
      <ReadingRemovalToast removal={removal} />
      <StoreSetupSheet store={store} />
    </Screen>
  );
}

/** AA4 公開設定沒開：讀者看不到這一類 */
function HiddenBar({ what }: { what: string }) {
  const c = useTheme();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push('/store-visibility')} style={[styles.hidden, { backgroundColor: c.surfaceMuted }]}>
      <Feather name="eye-off" size={15} color={c.textSecondary} />
      <AppText variant="caption" style={{ flex: 1 }}>{tr('讀者看不到「{what}」', { what })}</AppText>
      <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('公開設定 ›')}</AppText>
    </Pressable>
  );
}

/** AA3 想讀分頁的第二段：積讀（買了還沒讀）；完整管理在書櫃 › 積讀 */
function OwnerTbr({ color, hiddenFromReaders }: { color: StoreColor; hiddenFromReaders: boolean }) {
  const c = useTheme();
  const { data } = useMyPurchases();
  const unread = (data?.items ?? []).filter((p) => p.status === 'unread');
  if (!unread.length) return null;
  return (
    <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <AppText variant="label" style={{ fontSize: 15, flex: 1 }}>{tr('積讀 · {n}', { n: unread.length })}</AppText>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push({ pathname: '/saved', params: { tab: 'tbr' } })}>
          <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('管理 ›')}</AppText>
        </Pressable>
      </View>
      {hiddenFromReaders ? <AppText variant="caption" muted>{tr('讀者看不到積讀；到公開設定可以打開（不會顯示金額和在哪買）。')}</AppText> : null}
      {unread.slice(0, 5).map((p) => (
        <Pressable key={p.id} accessibilityRole="link" onPress={() => router.push({ pathname: '/book/[id]', params: { id: p.book_id } })} style={[styles.tbr, { backgroundColor: c.surface }]}>
          <BookCover title={p.book.title} url={p.book.cover_url} color={color} size="sm" />
          <View style={{ flex: 1 }}>
            <AppText variant="label">{p.book.title}</AppText>
            <AppText variant="caption" muted numberOfLines={1}>{[p.bought_on.slice(5).replace('-', '/'), p.place_name ?? p.store_label].filter(Boolean).join(' · ')}</AppText>
          </View>
          <Feather name="chevron-right" size={16} color={c.textTertiary} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg },
  hidden: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.md, paddingHorizontal: Spacing.md, minHeight: 40 },
  tbr: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.md },
});
