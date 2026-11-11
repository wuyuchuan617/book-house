import Feather from '@expo/vector-icons/Feather';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, EmptyState, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';
import { timeAgo } from '@/lib/period';
import { useInbox, useMarkRead, type InboxItem } from '@/lib/store-v16';

const ICON: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  new_curation: 'layers',
  new_follower: 'user-plus',
  monthly_reminder: 'calendar',
  weekly_review: 'book-open',
  prescription: 'message-circle',
  onboarding: 'smile',
  moderation: 'shield',
  feedback: 'inbox',
};

/** 通知列表（S3、S4）：推播送出的通知也留一份；打開這頁全部算已讀，點一則打開對應畫面 */
export default function NotificationsScreen() {
  const c = useTheme();
  const inbox = useInbox();
  const mark = useMarkRead();
  const unread = inbox.data?.unread ?? 0;

  useEffect(() => {
    if (unread) {
      const t = setTimeout(() => mark.mutate(undefined), 1500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread]);

  const open = (n: InboxItem) => {
    if (!n.read) mark.mutate(n.id);
    const url = n.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('通知') }} />
      {inbox.isPending ? (
        <ActivityIndicator style={{ marginTop: 48 }} />
      ) : inbox.error ? (
        <EmptyState title={tr('沒有載入成功')} body={tr('檢查網路後再試一次。')} actionLabel={tr('重試')} onAction={() => void inbox.refetch()} />
      ) : (
        <FlatList
          data={inbox.data?.items ?? []}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.sm, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={inbox.isRefetching} onRefresh={() => void inbox.refetch()} />}
          ListEmptyComponent={<EmptyState title={tr('還沒有通知')} body={tr('有人追蹤你、開處方給你，或追蹤的書店上架新策展，會出現在這裡。')} />}
          ListFooterComponent={inbox.data?.items.length ? <AppText variant="caption" style={{ color: c.textTertiary, textAlign: 'center', marginTop: Spacing.md }}>{tr('只保留最近 60 天。要收哪些通知，到設定 › 通知調整。')}</AppText> : undefined}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.read ? '' : tr('未讀，')}${item.title}，${item.body}`}
              onPress={() => open(item)}
              style={({ pressed }) => [styles.row, { backgroundColor: c.surface, opacity: pressed ? 0.8 : 1 }]}>
              <View style={[styles.icon, { backgroundColor: item.read ? c.divider : c.primary }]}>
                <Feather name={ICON[item.kind] ?? 'bell'} size={16} color={item.read ? c.textSecondary : c.onPrimary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label" style={{ fontWeight: item.read ? '600' : '700' }}>{item.title}</AppText>
                <AppText variant="caption" muted numberOfLines={2}>{item.body}</AppText>
                <AppText variant="caption" style={{ color: c.textTertiary }}>{timeAgo(item.created_at)}</AppText>
              </View>
              {!item.read ? <View style={[styles.dot, { backgroundColor: c.primary }]} /> : null}
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
