import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TypeTag } from '@/components/event-card';
import { ActionSheet } from '@/components/sheet';
import { StoreAvatar } from '@/components/social';
import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useDiaryImageUrls } from '@/lib/diary';
import { addToCalendar, eventError, eventTime, useDeleteShare, useEventDetail, useEventGo, useReportEvent, type EventShare } from '@/lib/events';
import { tr } from '@/lib/i18n';
import { timeAgo } from '@/lib/period';

/** AE3 活動頁：活動資料、我會去／加入行事曆／分享、大家的分享；最下面「我也要分享」 */
export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const { requireAuth } = useAuth();
  const { data: e, isLoading, refetch, isRefetching } = useEventDetail(id);
  const go = useEventGo();
  const report = useReportEvent();
  const del = useDeleteShare();
  const [menu, setMenu] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [now] = useState(() => Date.now());

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!e) return <EmptyState title={tr('找不到這個活動')} body={tr('它可能已經被合併或刪除了。')} />;

  const days = Math.ceil((new Date(e.starts_at).getTime() - now) / 86400e3);
  const fail = (err: Error) => Alert.alert(tr('沒有成功'), eventError(err.message));
  const mine = e.shares.find((s) => s.is_mine);

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={tr('更多操作')} onPress={() => setMenu(true)} style={{ padding: 8 }}>
              <Feather name="more-horizontal" size={22} color={c.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.md, paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <TypeTag type={e.event_type} />
          <AppText variant="caption" muted>{e.over ? tr('已結束') : days <= 0 ? tr('今天') : tr('還有 {n} 天', { n: days })}</AppText>
        </View>
        <AppText variant="title" style={{ fontSize: 24, lineHeight: 32 }}>{e.title}</AppText>
        <Card style={{ paddingVertical: 0 }}>
          <Row icon="calendar" text={eventTime(e)} />
          {e.place ? <Row icon="map-pin" text={e.place.name} sub={e.place.address} onPress={() => router.push({ pathname: '/place/[id]', params: { id: e.place!.id } })} /> : null}
          {e.online ? <Row icon="monitor" text={tr('線上活動')} /> : null}
          {e.url ? <Row icon="link" text={tr('活動連結')} sub={e.url} onPress={() => void Linking.openURL(e.url!)} last /> : null}
        </Card>
        {!e.over ? (
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <Action icon={e.i_going ? 'check-circle' : 'bookmark'} label={e.i_going ? tr('我會去') : tr('我會去')} on={e.i_going} onPress={() => requireAuth(() => go.mutate({ id: e.id, on: !e.i_going }, { onError: fail }))} />
            <Action icon="calendar" label={tr('加入行事曆')} onPress={() => addToCalendar(e)} />
            <Action icon="share" label={tr('分享')} onPress={() => void Share.share({ message: `${e.title} ${eventTime(e)}${e.url ? `\n${e.url}` : ''}` })} />
          </View>
        ) : null}
        <AppText variant="label" style={{ fontSize: 15, marginTop: Spacing.sm }}>
          {tr('大家的分享 · {n}', { n: e.shares.length })} <AppText variant="caption" muted>{tr('· {n} 人會去', { n: e.going_count })}</AppText>
        </AppText>
        {e.shares.map((s) => <ShareRow key={s.id} s={s} onDelete={() => Alert.alert(tr('刪除你的分享？'), undefined, [{ text: tr('取消'), style: 'cancel' }, { text: tr('刪除'), style: 'destructive', onPress: () => del.mutate(s.id, { onError: fail }) }])} />)}
      </ScrollView>
      {!e.over ? (
        <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <Button label={mine ? tr('修改我的分享') : tr('我也要分享')} onPress={() => requireAuth(() => router.push({ pathname: '/event/share', params: { eventId: e.id } }))} />
        </SafeAreaView>
      ) : null}

      <ActionSheet
        visible={menu}
        title={e.title}
        onClose={() => setMenu(false)}
        actions={[
          { label: tr('回報資料有誤'), sub: tr('時間、地點或連結不對，管理員會修正'), icon: 'flag' as const, onPress: () => requireAuth(() => setReportOpen(true)) },
        ]}
      />
      <ActionSheet
        visible={reportOpen}
        title={tr('哪裡不對？')}
        onClose={() => setReportOpen(false)}
        actions={[tr('時間不對'), tr('地點不對'), tr('連結不對'), tr('跟另一個活動重複'), tr('不是跟書有關的活動')].map((r) => ({
          label: r,
          onPress: () => report.mutate({ id: e.id, reason: r }, { onSuccess: () => Alert.alert(tr('已送出'), tr('謝謝你，我們會盡快確認。')), onError: fail }),
        }))}
      />
    </Screen>
  );
}

function Row({ icon, text, sub, onPress, last }: { icon: React.ComponentProps<typeof Feather>['name']; text: string; sub?: string | null; onPress?: () => void; last?: boolean }) {
  const c = useTheme();
  return (
    <Pressable accessibilityRole={onPress ? 'link' : undefined} disabled={!onPress} onPress={onPress} style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider }]}>
      <Feather name={icon} size={16} color={c.text} />
      <View style={{ flex: 1 }}>
        <AppText>{text}</AppText>
        {sub ? <AppText variant="caption" muted numberOfLines={1}>{sub}</AppText> : null}
      </View>
      {onPress ? <Feather name="chevron-right" size={16} color={c.textTertiary} /> : null}
    </Pressable>
  );
}

function Action({ icon, label, on, onPress }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; on?: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={on === undefined ? undefined : { selected: on }} onPress={onPress} style={[styles.action, { backgroundColor: c.surface, borderColor: on ? c.primary : c.border }]}>
      <Feather name={icon} size={16} color={on ? c.primary : c.text} />
      <AppText variant="label" style={{ color: on ? c.primary : c.text }}>{label}</AppText>
    </Pressable>
  );
}

function ShareRow({ s, onDelete }: { s: EventShare; onDelete: () => void }) {
  const c = useTheme();
  const photos = useDiaryImageUrls(s.photo_paths);
  return (
    <Card style={{ gap: Spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        <Pressable accessibilityRole={s.author.slug ? 'link' : undefined} disabled={!s.author.slug} onPress={() => s.author.slug && router.push({ pathname: '/store/[slug]', params: { slug: s.author.slug } })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <StoreAvatar name={s.author.name} color={s.author.color ?? 'moss'} size={26} path={s.author.avatar_path} />
          <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>{s.author.name}</AppText>
          <AppText variant="caption" style={{ color: c.textTertiary }}>{`· ${timeAgo(s.created_at)}`}</AppText>
        </Pressable>
        {s.is_mine ? (
          <Pressable accessibilityRole="button" accessibilityLabel={tr('刪除你的分享')} hitSlop={8} onPress={onDelete}>
            <Feather name="trash-2" size={16} color={c.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {s.body ? <AppText style={{ lineHeight: 22 }}>{s.body}</AppText> : null}
      {s.photo_paths.length ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {s.photo_paths.map((p, i) => <Image key={p} source={photos.data?.[i] ? { uri: photos.data[i]! } : undefined} style={[styles.photo, { backgroundColor: c.surfaceMuted }]} contentFit="cover" />)}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 52, paddingVertical: Spacing.sm },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: Radius.md, minHeight: MinTouch + 2 },
  photo: { width: 96, height: 72, borderRadius: 10 },
  footer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
