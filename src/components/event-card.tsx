import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { StoreAvatar } from '@/components/social';
import { AppText, Card, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { addToCalendar, EVENT_TYPE_LABEL, eventDay, eventError, eventTime, eventWhere, useEventGo, useExploreEvents, type BookEvent } from '@/lib/events';
import { tr } from '@/lib/i18n';

export const EVENT_FG = '#9A4A12';
export const EVENT_BG = '#FBEBDD';

const openEvent = (id: string) => router.push({ pathname: '/event/[id]', params: { id } });

/** 左邊的日曆塊：星期＋日 */
export function DateBlock({ iso }: { iso: string }) {
  const c = useTheme();
  const d = eventDay(iso);
  return (
    <View style={[styles.date, { borderColor: c.border, backgroundColor: c.surface }]}>
      <View style={{ backgroundColor: EVENT_FG, paddingVertical: 2 }}><AppText variant="caption" style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 11, textAlign: 'center' }}>{d.week}</AppText></View>
      <AppText style={{ fontSize: 20, fontWeight: '700', textAlign: 'center', paddingVertical: 3 }}>{d.day}</AppText>
    </View>
  );
}

export function TypeTag({ type }: { type: BookEvent['event_type'] }) {
  return (
    <View style={[styles.tag, { backgroundColor: EVENT_BG }]}>
      <AppText variant="caption" style={{ color: EVENT_FG, fontWeight: '700', fontSize: 11 }}>{EVENT_TYPE_LABEL()[type]}</AppText>
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
            <Feather name={e.online ? 'monitor' : 'map-pin'} size={12} color="#2F5D6B" />
            <AppText variant="caption" style={{ color: '#2F5D6B', fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>{eventWhere(e)}</AppText>
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

/** AE2 探索 › 貼文 › 活動：一個活動一張卡 */
export function EventCard({ e }: { e: BookEvent }) {
  const c = useTheme();
  const { requireAuth } = useAuth();
  const go = useEventGo();
  const toggleGo = () => requireAuth(() => go.mutate({ id: e.id, on: !e.i_going }, { onError: (err) => Alert.alert(tr('沒有成功'), eventError(err.message)) }));
  return (
    <Card style={{ gap: Spacing.sm }}>
      <Pressable accessibilityRole="link" onPress={() => openEvent(e.id)} style={{ gap: Spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: Spacing.md, alignItems: 'center' }}>
          <DateBlock iso={e.starts_at} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <AppText variant="label" style={{ flex: 1, fontSize: 16 }}>{e.title}</AppText>
              <TypeTag type={e.event_type} />
            </View>
            <AppText variant="caption" muted>{eventTime(e)}</AppText>
            {eventWhere(e) ? <AppText variant="caption" style={{ color: '#2F5D6B', fontWeight: '600' }} numberOfLines={1}>{`⌖ ${eventWhere(e)}`}</AppText> : null}
          </View>
        </View>
        {e.sharers.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <View style={{ flexDirection: 'row' }}>
              {e.sharers.map((s, i) => (
                <View key={`${s.name}-${i}`} style={{ marginLeft: i ? -6 : 0, borderWidth: 2, borderColor: c.surface, borderRadius: 9 }}>
                  <StoreAvatar name={s.name} color={s.color ?? 'moss'} size={20} path={s.avatar_path} />
                </View>
              ))}
            </View>
            <AppText variant="caption" muted style={{ flex: 1 }} numberOfLines={1}>{sharersLine(e)}</AppText>
          </View>
        ) : null}
        {e.latest ? (
          <View style={[styles.quote, { backgroundColor: c.background }]}>
            <AppText variant="caption" style={{ lineHeight: 19 }} numberOfLines={3}>{tr('「{body}」—{name}', { body: e.latest.body, name: e.latest.name })}</AppText>
          </View>
        ) : null}
      </Pressable>
      <View style={styles.foot}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: e.i_going }} onPress={toggleGo} style={styles.footBtn}>
          <Feather name={e.i_going ? 'check-circle' : 'bookmark'} size={16} color={e.i_going ? c.primary : c.textSecondary} />
          <AppText variant="caption" style={{ color: e.i_going ? c.primary : c.textSecondary, fontWeight: e.i_going ? '700' : '500' }}>{tr('我會去 · {n}', { n: e.going_count })}</AppText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => addToCalendar(e)} style={styles.footBtn}>
          <Feather name="calendar" size={16} color={c.textSecondary} />
          <AppText variant="caption" muted>{tr('加入行事曆')}</AppText>
        </Pressable>
      </View>
    </Card>
  );
}

/** 探索 › 貼文 › 活動 */
export function EventsExplore({ filter = 'all', near = null }: { filter?: 'all' | 'following' | 'near'; near?: { lat: number; lng: number } | null }) {
  const list = useExploreEvents(filter, near);
  if (list.isPending) return <ActivityIndicator style={{ marginTop: 48 }} />;
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
  quote: { borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  foot: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, marginBottom: -Spacing.sm, marginTop: -Spacing.xs },
  footBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 },
});
