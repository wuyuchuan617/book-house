import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { CheckinCard } from '@/components/diary';
import { Chip } from '@/components/form';
import { SavePlaceSheet } from '@/components/save-place-sheet';
import { ActionSheet } from '@/components/sheet';
import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { categoryIcon, categoryLabel, diaryError, openInGoogleMaps, useAdminIndie, useIndieVote, usePlaceDetail, useReportCheckin, type PublicCheckin } from '@/lib/diary';
import { useIsAdmin } from '@/lib/admin';
import { tr } from '@/lib/i18n';
import { REPORT_REASONS } from '@/lib/safety';

/**
 * L1 地點頁：想去（可寫原因）、在 Google 地圖開啟、在這裡打卡；獨立書店標記；
 * 在這裡讀過的書、公開打卡（只顯示日期，可檢舉）
 */
export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const { session, requireAuth } = useAuth();
  const { data, isLoading, refetch, isRefetching } = usePlaceDetail(id);
  const vote = useIndieVote();
  const adminIndie = useAdminIndie();
  const { data: isAdmin } = useIsAdmin();
  const [saveOpen, setSaveOpen] = useState(false);
  const report = useReportCheckin();
  const [menuFor, setMenuFor] = useState<PublicCheckin | null>(null);
  const [reportFor, setReportFor] = useState<PublicCheckin | null>(null);

  useEffect(() => {
    if (id) track('place_opened', {});
  }, [id]);

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!data) return <EmptyState title={tr('找不到這個地點')} body={tr('它可能已經被移除了。')} />;
  const { place } = data;

  const fail = (e: Error) => Alert.alert(tr('沒有成功'), diaryError(e.message));
  const openSave = () => requireAuth(() => setSaveOpen(true));
  const bookstore = place.category === 'bookstore';
  const checkinHere = () =>
    requireAuth(() =>
      router.push({
        pathname: '/diary/compose',
        params: { kind: 'checkin', placeId: place.id, placeName: place.name, googlePlaceId: place.google_place_id, publicOk: place.public_ok ? '1' : '0', category: place.category },
      }),
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}>
        <View style={{ flexDirection: 'row', gap: Spacing.lg, alignItems: 'center' }}>
          <View style={[styles.icon, { backgroundColor: c.surfaceMuted }]}>
            <Feather name={categoryIcon(place.category)} size={26} color={c.primary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="title" style={{ fontSize: 24 }}>{place.name}</AppText>
            <AppText variant="caption" muted>{[categoryLabel(place.category, data.is_indie), place.address].filter(Boolean).join(' · ')}</AppText>
          </View>
        </View>

        <AppText variant="caption" muted>
          {[tr('{n} 則公開打卡', { n: data.checkin_count }), tr('{n} 人想去', { n: data.save_count }), session && data.my_checkins ? tr('你來過 {n} 次', { n: data.my_checkins }) : null].filter(Boolean).join(' · ')}
        </AppText>

        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: data.saved }}
            onPress={openSave}
            style={[styles.action, { backgroundColor: data.saved ? c.primary : c.surface, borderColor: data.saved ? c.primary : c.border }]}>
            <Feather name="bookmark" size={16} color={data.saved ? c.onPrimary : c.text} />
            <AppText variant="label" style={{ color: data.saved ? c.onPrimary : c.text }}>{data.saved ? tr('已存想去') : tr('想去')}</AppText>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => openInGoogleMaps(place.name, place.google_place_id)} style={[styles.action, { backgroundColor: c.surface, borderColor: c.border, flex: 1.6 }]}>
            <Feather name="navigation" size={16} color={c.text} />
            <AppText variant="label">{tr('在 Google 地圖開啟')}</AppText>
          </Pressable>
        </View>
        <Button label={tr('在這裡打卡')} onPress={checkinHere} />

        {data.saved && data.my_note ? (
          <Pressable accessibilityRole="button" onPress={openSave} style={[styles.note, { backgroundColor: c.surface }]}>
            <Feather name="bookmark" size={14} color={c.primary} />
            <AppText style={{ flex: 1, lineHeight: 21 }}>{data.my_note}</AppText>
            <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('編輯')}</AppText>
          </Pressable>
        ) : null}

        {bookstore && session ? (
          <View style={[styles.indie, { backgroundColor: c.surface }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="label">{data.is_indie ? tr('獨立書店') : tr('這是獨立書店嗎？')}</AppText>
              <AppText variant="caption" muted>
                {data.indie_override != null ? tr('由書棲確認') : tr('{n} 人標記為獨立書店 · 2 人以上就會顯示', { n: data.indie_votes })}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: data.my_indie_vote }}
              disabled={vote.isPending}
              onPress={() => vote.mutate({ placeId: place.id, vote: !data.my_indie_vote }, { onError: fail })}
              style={[styles.voteBtn, { borderColor: data.my_indie_vote ? c.primary : c.border, backgroundColor: data.my_indie_vote ? c.primary : 'transparent' }]}>
              <AppText variant="caption" style={{ fontWeight: '700', color: data.my_indie_vote ? c.onPrimary : c.text }}>{data.my_indie_vote ? tr('已標記') : tr('是')}</AppText>
            </Pressable>
          </View>
        ) : null}
        {bookstore && isAdmin ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' }}>
            <AppText variant="caption" muted>{tr('管理員：')}</AppText>
            {([[true, tr('設為獨立書店')], [false, tr('不是獨立書店')], [null, tr('交給使用者標記')]] as const).map(([v, label]) => (
              <Chip key={String(v)} label={label} selected={data.indie_override === v} onPress={() => adminIndie.mutate({ placeId: place.id, value: v }, { onError: fail })} />
            ))}
          </View>
        ) : null}

        {data.books.length ? (
          <View style={{ gap: Spacing.sm }}>
            <AppText variant="heading">{tr('在這裡讀過的書')}</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.md }}>
              {data.books.map((b) => (
                <Pressable key={b.id} accessibilityRole="link" accessibilityLabel={b.title} onPress={() => router.push({ pathname: '/book/[id]', params: { id: b.id } })} style={{ width: 76, gap: 4 }}>
                  <BookCover title={b.title} url={b.cover_url} color="moss" size="md" />
                  <AppText variant="caption" numberOfLines={2}>{b.title}</AppText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={{ gap: Spacing.sm }}>
          <AppText variant="heading">{tr('大家的打卡')}</AppText>
          {data.checkins.length ? (
            data.checkins.map((ch) => <CheckinCard key={ch.id} checkin={ch} onMore={session ? () => setMenuFor(ch) : undefined} />)
          ) : (
            <Card style={{ alignItems: 'center', gap: 6 }}>
              <AppText variant="label">{tr('還沒有公開的打卡')}</AppText>
              <AppText variant="caption" muted style={{ textAlign: 'center' }}>{tr('來這裡讀書時打個卡，選擇公開，就會出現在這裡。')}</AppText>
            </Card>
          )}
        </View>
        <AppText variant="caption" style={{ color: c.textTertiary, textAlign: 'center' }}>{tr('地點資料來自 Google')}</AppText>
      </ScrollView>

      <SavePlaceSheet
        place={saveOpen ? { ...place, is_indie: data.is_indie, note: data.my_note, my_indie_vote: data.my_indie_vote } : null}
        saved={data.saved}
        from="place_page"
        onClose={() => setSaveOpen(false)}
      />
      <ActionSheet
        visible={!!menuFor}
        onClose={() => setMenuFor(null)}
        actions={[
          {
            label: tr('檢舉這則打卡'),
            destructive: true,
            onPress: () => {
              const target = menuFor;
              setMenuFor(null);
              setTimeout(() => setReportFor(target), 400);
            },
          },
        ]}
      />
      <ActionSheet
        visible={!!reportFor}
        title={tr('檢舉原因')}
        onClose={() => setReportFor(null)}
        actions={REPORT_REASONS.map((r) => ({
          label: r.label,
          sub: r.sub,
          onPress: () => {
            const target = reportFor;
            setReportFor(null);
            if (!target) return;
            report.mutate(
              { entryId: target.id, reason: r.value },
              {
                onSuccess: () => Alert.alert(tr('已送出檢舉'), tr('謝謝你，我們會盡快處理。')),
                onError: (e) => Alert.alert(tr('沒有送出'), diaryError(e.message)),
              },
            );
          },
        }))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: { width: 60, height: 60, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, padding: Spacing.lg },
  indie: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg },
  voteBtn: { minWidth: 64, minHeight: 36, borderRadius: Radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, minHeight: MinTouch + 4 },
});
