import Feather from '@expo/vector-icons/Feather';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { RX_PURPLE } from '@/components/rx-explore';
import { ActionSheet } from '@/components/sheet';
import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useSaveIds, useToggleSave } from '@/lib/browse';
import { tr } from '@/lib/i18n';
import { shareRx } from '@/lib/links';
import { timeAgo } from '@/lib/period';
import { authorName, daysLeft, rxError, rxTagLabel, useRx, useRxAction, useRxReport, type RxBookGroup, type RxDetail } from '@/lib/rx';
import { REPORT_REASONS } from '@/lib/safety';

/** X3 處方簽詳情：同一本書合併成一張卡（依人數），每本都能「想讀」；底部：開一張處方／修改處方；發起人的 ⋯：分享、延長、結案、刪除 */
export default function RxScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const { session, requireAuth } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useRx(id);
  const action = useRxAction();
  const report = useRxReport();
  const [menu, setMenu] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!data) return <EmptyState title={tr('找不到這張處方簽')} body={tr('它可能已經被刪除了。')} actionLabel={tr('回探索')} onAction={() => router.navigate('/')} />;

  const left = daysLeft(data.closes_at, data.is_open);
  const run = (a: 'close' | 'extend' | 'delete') =>
    action.mutate(
      { id: data.id, action: a },
      {
        onSuccess: () => {
          if (a === 'delete') router.back();
        },
        onError: (e) => Alert.alert(tr('沒有成功'), rxError(e.message)),
      },
    );
  const ownerActions = [
    { label: tr('分享'), onPress: () => { setMenu(false); shareRx(data.id, data.title, { afterModal: true }); } },
    ...(data.is_open && !data.extended ? [{ label: tr('延長 7 天'), onPress: () => { setMenu(false); run('extend'); } }] : []),
    ...(data.is_open ? [{ label: tr('提早結案'), onPress: () => { setMenu(false); run('close'); } }] : []),
    {
      label: tr('刪除這張處方簽'),
      destructive: true,
      onPress: () => {
        setMenu(false);
        setTimeout(
          () =>
            Alert.alert(tr('刪除這張處方簽？'), tr('大家開的處方會一起刪除，無法復原。'), [
              { text: tr('取消'), style: 'cancel' },
              { text: tr('刪除'), style: 'destructive', onPress: () => run('delete') },
            ]),
          400,
        );
      },
    },
  ];
  const readerActions = [
    { label: tr('分享'), onPress: () => { setMenu(false); shareRx(data.id, data.title, { afterModal: true }); } },
    { label: tr('檢舉這張處方簽'), destructive: true, onPress: () => { setMenu(false); setTimeout(() => setReportOpen(true), 400); } },
  ];

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: tr('閱讀處方簽'),
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={tr('更多操作')} onPress={() => requireAuth(() => setMenu(true))} style={{ padding: 8 }}>
              <Feather name="more-horizontal" size={22} color={c.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}>
        <View style={[styles.hero, { backgroundColor: '#ECE8F4' }]}>
          <AppText variant="title" style={{ fontSize: 20, lineHeight: 28 }}>
            <AppText style={{ color: RX_PURPLE, fontSize: 20, fontWeight: '700' }}>℞ </AppText>
            {data.title}
          </AppText>
          {data.body ? <AppText style={{ lineHeight: 22, color: c.textSecondary }}>{data.body}</AppText> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            {data.tags.map((t) => (
              <View key={t} style={[styles.tag, { backgroundColor: c.surface }]}><AppText variant="caption" muted style={{ fontSize: 11, fontWeight: '700' }}>{rxTagLabel(t)}</AppText></View>
            ))}
            <Pressable
              disabled={!data.author.slug}
              accessibilityRole={data.author.slug ? 'link' : undefined}
              onPress={() => data.author.slug && router.push({ pathname: '/store/[slug]', params: { slug: data.author.slug } })}>
              <AppText variant="caption" style={{ color: data.author.slug ? c.primary : c.textSecondary, fontWeight: data.author.slug ? '700' : '400' }}>{authorName(data.author)}</AppText>
            </Pressable>
            <AppText variant="caption" muted>{`· ${timeAgo(data.created_at)} · ${left ? tr('還有 {n} 天', { n: left }) : tr('已結案')}`}</AppText>
          </View>
        </View>

        <AppText variant="label">{tr('{n} 張處方 · {m} 本書', { n: data.reply_count, m: data.books.length })}</AppText>
        {data.books.length ? (
          data.books.map((g) => <BookGroup key={g.book.id} group={g} rx={data} onReport={(rid) => requireAuth(() => report.mutate({ target: 'prescription_reply', id: rid, reason: 'inappropriate' }, { onSuccess: () => Alert.alert(tr('已送出檢舉'), tr('謝謝你，我們會盡快處理。')), onError: (e) => Alert.alert(tr('沒有送出'), rxError(e.message)) }))} />)
        ) : (
          <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 24 }}>
            <AppText variant="label">{tr('還沒有人開處方')}</AppText>
            <AppText variant="caption" muted style={{ textAlign: 'center' }}>{data.is_mine ? tr('分享給朋友，請他們各開一本。') : tr('你可以搶先開第一張。')}</AppText>
          </Card>
        )}
        {data.is_mine && data.books.length ? <AppText variant="caption" style={{ color: c.textTertiary, textAlign: 'center' }}>{tr('按「想讀」會加入你的想讀清單，開這本的人會收到通知。')}</AppText> : null}
      </ScrollView>

      {!data.is_mine && (data.is_open || data.my_reply) ? (
        <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          {data.my_reply ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
              <AppText variant="caption" muted style={{ flex: 1 }} numberOfLines={2}>{tr('你開了《{title}》', { title: data.my_reply.book.title })}</AppText>
              {data.is_open ? <Button kind="secondary" label={tr('修改處方')} onPress={() => router.push({ pathname: '/rx/reply', params: { id: data.id } })} /> : null}
            </View>
          ) : (
            <Button label={tr('℞ 開一張處方')} onPress={() => requireAuth(() => router.push({ pathname: '/rx/reply', params: { id: data.id } }))} />
          )}
        </SafeAreaView>
      ) : null}

      <ActionSheet visible={menu} onClose={() => setMenu(false)} actions={data.is_mine ? ownerActions : readerActions} />
      <ActionSheet
        visible={reportOpen}
        title={tr('檢舉原因')}
        onClose={() => setReportOpen(false)}
        actions={REPORT_REASONS.map((r) => ({
          label: r.label,
          sub: r.sub,
          onPress: () => {
            setReportOpen(false);
            if (!session) return;
            report.mutate(
              { target: 'prescription', id: data.id, reason: r.value },
              { onSuccess: () => Alert.alert(tr('已送出檢舉'), tr('謝謝你，我們會盡快處理。')), onError: (e) => Alert.alert(tr('沒有送出'), rxError(e.message)) },
            );
          },
        }))}
      />
    </Screen>
  );
}

function BookGroup({ group, rx, onReport }: { group: RxBookGroup; rx: RxDetail; onReport: (replyId: string) => void }) {
  const c = useTheme();
  const { requireAuth } = useAuth();
  const { data: saveIds } = useSaveIds();
  const toggleSave = useToggleSave();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const saved = !!saveIds?.has(group.book.id);
  const shown = expanded ? group.reasons : group.reasons.slice(0, 2);
  return (
    <Card style={{ gap: Spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/book/[id]', params: { id: group.book.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 }}>
          <BookCover title={group.book.title} url={group.book.cover_url} color="wisteria" size="md" />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label" numberOfLines={2}>{group.book.title}</AppText>
            <AppText variant="caption" muted numberOfLines={1}>
              {group.book.authors.join(tr('、'))}
              <AppText variant="caption" style={{ color: RX_PURPLE, fontWeight: '700' }}>{`  ${tr('{n} 人開出', { n: group.count })}`}</AppText>
            </AppText>
            {group.owner_wants && !rx.is_mine ? <AppText variant="caption" style={{ color: c.success, fontWeight: '700' }}>{tr('✓ 發起人加入想讀了')}</AppText> : null}
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: saved }}
          onPress={() =>
            requireAuth(() =>
              toggleSave.mutate(
                { bookId: group.book.id, save: !saved, sourceText: saved ? null : tr('閱讀處方簽') },
                { onSuccess: () => void qc.invalidateQueries({ queryKey: ['rx'] }) },
              ),
            )
          }
          style={[styles.want, { borderColor: saved ? c.success : c.primary, backgroundColor: saved ? c.successSurface : 'transparent' }]}>
          <Feather name="bookmark" size={13} color={saved ? c.success : c.primary} />
          <AppText variant="caption" style={{ fontWeight: '700', color: saved ? c.success : c.primary }}>{saved ? tr('已在想讀') : tr('想讀')}</AppText>
        </Pressable>
      </View>
      {shown.map((r) => (
        <View key={r.id} style={[styles.reason, { borderTopColor: c.divider }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Pressable disabled={!r.author.slug} onPress={() => r.author.slug && router.push({ pathname: '/store/[slug]', params: { slug: r.author.slug } })}>
              <AppText variant="caption" style={{ fontWeight: '700', color: r.author.slug ? c.text : c.textSecondary }}>{authorName(r.author)}</AppText>
            </Pressable>
            {r.is_mine ? <View style={[styles.you, { backgroundColor: c.text }]}><AppText variant="caption" style={{ color: c.background, fontSize: 10, fontWeight: '700' }}>{tr('你')}</AppText></View> : null}
            <View style={{ flex: 1 }} />
            {!r.is_mine ? (
              <Pressable accessibilityRole="button" accessibilityLabel={tr('檢舉這則理由')} hitSlop={8} onPress={() => Alert.alert(tr('檢舉這則理由？'), r.reason, [{ text: tr('取消'), style: 'cancel' }, { text: tr('檢舉'), style: 'destructive', onPress: () => onReport(r.id) }])}>
                <Feather name="flag" size={12} color={c.textTertiary} />
              </Pressable>
            ) : null}
          </View>
          <AppText style={{ lineHeight: 21, color: c.textSecondary }}>{r.reason}</AppText>
        </View>
      ))}
      {group.reasons.length > 2 && !expanded ? (
        <Pressable accessibilityRole="button" onPress={() => setExpanded(true)}>
          <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('再看 {n} 則理由', { n: group.reasons.length - 2 })}</AppText>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.sm },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.sm },
  footer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  want: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 12, minHeight: 32 },
  reason: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.sm, gap: 2 },
  you: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
});
