import { ListSkeleton } from '@/components/skeleton';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ActionSheet } from '@/components/sheet';

import { StoreAvatar } from '@/components/social';
import { AppText, Card, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { addToCalendar, EVENT_TYPE_LABEL, eventDay, eventError, eventTime, eventWhere, useEventGo, useExploreEvents, type BookEvent } from '@/lib/events';
import { tr } from '@/lib/i18n';
import { timeAgo } from '@/lib/period';


const openEvent = (id: string) => router.push({ pathname: '/event/[id]', params: { id } });

/** 左邊的日曆塊：星期＋日 */
export function DateBlock({ iso }: { iso: string }) {
  const c = useTheme();
  const d = eventDay(iso);
  return (
    <View style={[styles.date, { borderColor: c.border, backgroundColor: c.surface }]}>
      <View style={{ backgroundColor: c.event, paddingVertical: 2 }}><AppText variant="caption" style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 11, textAlign: 'center' }}>{d.week}</AppText></View>
      <AppText style={{ fontSize: 20, fontWeight: '700', textAlign: 'center', paddingVertical: 3 }}>{d.day}</AppText>
    </View>
  );
}

export function TypeTag({ type }: { type: BookEvent['event_type'] }) {
  const c = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: c.eventSurface }]}>
      <AppText variant="caption" style={{ color: c.event, fontWeight: '700', fontSize: 11 }}>{EVENT_TYPE_LABEL()[type]}</AppText>
    </View>
  );
}

/** 活動的基本資料一列（找活動、地點頁、寫分享上方） */
export function EventInfo({ e, sub, onPress }: { e: BookEvent; sub?: string | null; onPress?: () => void }) {
  const c = useTheme();
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={[styles.info, { backgroundColor: c.surface }]}>
      <DateBlock iso={e.starts_at} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <AppText variant="label" style={{ flex: 1 }}>{e.title}</AppText>
          <TypeTag type={e.event_type} />
        </View>
        <AppText variant="caption" muted>{eventTime(e)}</AppText>
        {eventWhere(e) ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Feather name={e.online ? 'monitor' : 'map-pin'} size={12} color={c.place} />
            <AppText variant="caption" style={{ color: c.place, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>{eventWhere(e)}</AppText>
          </View>
        ) : null}
        {sub ? <AppText variant="caption" muted>{sub}</AppText> : null}
      </View>
    </Pressable>
  );
}

export const sharersLine = (e: BookEvent) => {
  const names = e.sharers.map((s) => s.name);
  if (!names.length) return '';
  return e.share_count > 1 ? tr('{names} 等 {n} 人分享', { names: names.slice(0, 2).join(tr('、')), n: e.share_count }) : tr('{name}分享', { name: names[0] });
};

/** v1.8.2 AK2：探索 › 手記的活動卡，跟其他手記同一套——上面分享的人、時間、「活動」標籤；中間最新一則分享；活動小卡；下面「我會去」和「⋯」 */
export function EventCard({ e }: { e: BookEvent }) {
  const c = useTheme();
  const { requireAuth } = useAuth();
  const go = useEventGo();
  const [menu, setMenu] = useState(false);
  const toggleGo = () => requireAuth(() => go.mutate({ id: e.id, on: !e.i_going }, { onError: (err) => Alert.alert(tr('沒有成功'), eventError(err.message)) }));
  const first = e.sharers[0];
  const who = first ? (e.share_count > 1 ? tr('等 {n} 人', { n: e.share_count }) : '') : '';
  return (
    <Card style={{ gap: Spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        {first ? (
          <Pressable
            accessibilityRole={first.slug ? 'link' : undefined}
            disabled={!first.slug}
            onPress={() => first.slug && router.push({ pathname: '/store/[slug]', params: { slug: first.slug } })}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <StoreAvatar name={first.name} color={first.color ?? 'moss'} size={30} path={first.avatar_path} />
            <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>{first.name}</AppText>
            <AppText variant="caption" style={{ color: c.textTertiary }} numberOfLines={1}>{[who, e.latest_at ? timeAgo(e.latest_at) : null].filter(Boolean).join(' · ')}</AppText>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <View style={[styles.tag, { backgroundColor: c.eventSurface }]}>
          <AppText variant="caption" style={{ color: c.event, fontWeight: '700', fontSize: 11 }}>{tr('活動')}</AppText>
        </View>
      </View>
      {e.latest?.body ? <AppText style={{ lineHeight: 23, fontSize: 15 }} numberOfLines={4}>{e.latest.body}</AppText> : null}
      <Pressable accessibilityRole="link" onPress={() => openEvent(e.id)} style={[styles.mini, { backgroundColor: c.background }]}>
        <DateBlock iso={e.starts_at} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>{e.title}</AppText>
            <AppText variant="caption" style={{ color: c.event, fontWeight: '700' }}>{EVENT_TYPE_LABEL()[e.event_type]}</AppText>
          </View>
          <AppText variant="caption" muted numberOfLines={1}>{[eventTime(e), eventWhere(e) || null].filter(Boolean).join(' · ')}</AppText>
        </View>
        <Feather name="chevron-right" size={16} color={c.textTertiary} />
      </Pressable>
      <View style={styles.foot}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: e.i_going }} onPress={toggleGo} style={styles.footBtn}>
          <Feather name={e.i_going ? 'check-circle' : 'bookmark'} size={16} color={e.i_going ? c.primary : c.textSecondary} />
          <AppText variant="caption" style={{ color: e.i_going ? c.primary : c.textSecondary, fontWeight: e.i_going ? '700' : '500' }}>{tr('我會去 · {n}', { n: e.going_count })}</AppText>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={tr('更多操作')} onPress={() => setMenu(true)} style={[styles.footBtn, { justifyContent: 'center', minWidth: 44 }]}>
          <Feather name="more-horizontal" size={18} color={c.textSecondary} />
        </Pressable>
      </View>
      <ActionSheet
        visible={menu}
        title={e.title}
        onClose={() => setMenu(false)}
        actions={[
          { label: tr('加入行事曆'), icon: 'calendar' as const, onPress: () => addToCalendar(e) },
          { label: tr('看活動'), icon: 'info' as const, onPress: () => openEvent(e.id) },
          ...(e.i_shared ? [] : [{ label: tr('我也要分享'), icon: 'edit-2' as const, onPress: () => requireAuth(() => router.push({ pathname: '/event/share', params: { eventId: e.id } })) }]),
        ]}
      />
    </Card>
  );
}

/** 探索 › 貼文 › 活動 */
export function EventsExplore({ filter = 'all', near = null }: { filter?: 'all' | 'following' | 'near'; near?: { lat: number; lng: number } | null }) {
  const list = useExploreEvents(filter, near);
  if (list.isPending) return <ListSkeleton />;
  return (
    <FlatList
      data={list.data ?? []}
      keyExtractor={(e) => e.id}
      contentContainerStyle={{ padding: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md, flexGrow: 1, paddingBottom: 96 }}
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
      ListEmptyComponent={<EmptyState title={tr('近期還沒有活動')} body={tr('看到書市集、簽書會或講座，分享給大家吧。')} actionLabel={tr('分享一個活動')} onAction={() => router.push('/event/share')} />}
      renderItem={({ item }) => <EventCard e={item} />}
    />
  );
}

const styles = StyleSheet.create({
  date: { width: 52, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  tag: { borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 2 },
  info: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.md },
  mini: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.md, padding: Spacing.sm },
  foot: { flexDirection: 'row', alignItems: 'center', marginBottom: -Spacing.sm, marginTop: -Spacing.xs },
  footBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 },
});
