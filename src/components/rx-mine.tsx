import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { Chip, chipRow } from '@/components/form';
import { ActionSheet, type SheetAction } from '@/components/sheet';
import { MoreButton } from '@/components/swipe-row';
import { AppText, Button, Card } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';
import { shareRx } from '@/lib/links';
import { taipeiDate } from '@/lib/period';
import { daysLeft, rxError, useRxAction, useRxMine, useRxSetAnonymous, useRxWithdraw, type RxMineReplied, type RxMineStarted } from '@/lib/rx';

type Item = RxMineStarted | RxMineReplied;

/**
 * W4 我的書店 › 處方箋（v1.6，從手記和書櫃獨立出來）：我發起的／我開的。
 * 新增走右下＋；只有還沒發起過時，空狀態放一顆「發起第一張處方箋」。
 */
export function OwnerRx() {
  const [kind, setKind] = useState<'started' | 'replied'>('started');
  const started = useRxMine('started');
  const replied = useRxMine('replied');
  const list = kind === 'started' ? started : replied;
  const [menuFor, setMenuFor] = useState<Item | null>(null);
  const action = useRxAction();
  const withdraw = useRxWithdraw();
  const setAnon = useRxSetAnonymous();
  const fail = (e: Error) => Alert.alert(tr('沒有成功'), rxError(e.message));
  const confirm = (title: string, body: string, label: string, run: () => void) =>
    Alert.alert(title, body, [
      { text: tr('取消'), style: 'cancel' },
      { text: label, style: 'destructive', onPress: run },
    ]);

  const actionsFor = (item: Item): SheetAction[] => {
    if ('my_book' in item) {
      return [
        ...(item.is_open ? [{ label: tr('修改處方'), icon: 'edit-2' as const, onPress: () => router.push({ pathname: '/rx/reply', params: { id: item.id } }) }] : []),
        { label: tr('分享'), icon: 'share' as const, onPress: () => shareRx(item.id, item.title, { afterModal: true }) },
        {
          label: tr('撤回'),
          sub: tr('撤回後可以再開一次'),
          icon: 'rotate-ccw' as const,
          destructive: true,
          onPress: () => confirm(tr('撤回這張處方？'), tr('撤回後可以再開一次。'), tr('撤回'), () => withdraw.mutate(item.id, { onError: fail })),
        },
      ];
    }
    return [
      ...(item.is_open && item.reply_count === 0 ? [{ label: tr('編輯'), sub: tr('還沒有人開處方時可以改'), icon: 'edit-2' as const, onPress: () => router.push({ pathname: '/rx/new', params: { id: item.id } }) }] : []),
      item.anonymous
        ? { label: tr('改成顯示書店名稱'), sub: tr('會出現在你的書店頁「處方箋」'), icon: 'eye' as const, onPress: () => setAnon.mutate({ id: item.id, anonymous: false }, { onError: fail }) }
        : { label: tr('改成匿名'), sub: tr('從你的書店頁拿掉，別人看不到是誰發起的'), icon: 'eye-off' as const, onPress: () => setAnon.mutate({ id: item.id, anonymous: true }, { onError: fail }) },
      ...(item.is_open ? [{ label: tr('結案'), sub: tr('不再收新的處方'), icon: 'check-circle' as const, onPress: () => action.mutate({ id: item.id, action: 'close' }, { onError: fail }) }] : []),
      { label: tr('分享'), icon: 'share' as const, onPress: () => shareRx(item.id, item.title, { afterModal: true }) },
      {
        label: tr('刪除'),
        sub: tr('大家開的處方會一起刪除'),
        icon: 'trash-2' as const,
        destructive: true,
        onPress: () => confirm(tr('刪除這張處方箋？'), tr('大家開的處方會一起刪除，無法復原。'), tr('刪除'), () => action.mutate({ id: item.id, action: 'delete' }, { onError: fail })),
      },
    ];
  };

  const items = (list.data ?? []) as Item[];
  return (
    <View style={{ gap: Spacing.md }}>
      <View style={chipRow}>
        <Chip label={tr('我發起的 · {n}', { n: started.data?.length ?? 0 })} selected={kind === 'started'} onPress={() => setKind('started')} />
        <Chip label={tr('我開的 · {n}', { n: replied.data?.length ?? 0 })} selected={kind === 'replied'} onPress={() => setKind('replied')} />
      </View>
      {list.isPending ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : list.error ? (
        <Card style={{ alignItems: 'center', gap: Spacing.sm }}>
          <AppText variant="label">{tr('沒有載入成功')}</AppText>
          <Button kind="link" label={tr('重試')} onPress={() => void list.refetch()} />
        </Card>
      ) : items.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: Spacing.sm, paddingVertical: 24 }}>
          {kind === 'started' ? (
            <>
              <AppText variant="label">{tr('還沒有發起處方箋')}</AppText>
              <AppText variant="caption" muted style={{ textAlign: 'center' }}>{tr('說說你最近的狀況，請大家各開一本書。')}</AppText>
              <Button label={tr('發起第一張處方箋')} onPress={() => router.push('/rx/new')} style={{ alignSelf: 'stretch', marginTop: Spacing.sm }} />
            </>
          ) : (
            <>
              <AppText variant="label">{tr('還沒有開過處方')}</AppText>
              <AppText variant="caption" muted style={{ textAlign: 'center' }}>{tr('到探索 › 處方箋看看誰需要一本書。')}</AppText>
              <Button kind="secondary" label={tr('去看看')} onPress={() => router.navigate({ pathname: '/', params: { tab: 'rx' } })} style={{ alignSelf: 'stretch', marginTop: Spacing.sm }} />
            </>
          )}
        </Card>
      ) : (
        items.map((item) => <RxMineCard key={item.id} item={item} onMore={() => setMenuFor(item)} />)
      )}
      <ActionSheet visible={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.title} actions={menuFor ? actionsFor(menuFor) : []} />
    </View>
  );
}

export function RxMineCard({ item, onMore }: { item: Item; onMore?: () => void }) {
  const c = useTheme();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/rx/[id]', params: { id: item.id } })}>
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' }}>
          <AppText variant="label" style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>{item.title}</AppText>
          {'new_count' in item && item.new_count && item.is_open ? (
            <View style={[styles.badge, { backgroundColor: c.danger }]}><AppText variant="caption" style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>{tr('{n} 張新的', { n: item.new_count })}</AppText></View>
          ) : 'owner_wants' in item && item.owner_wants ? (
            <View style={[styles.badge, { backgroundColor: c.successSurface }]}><AppText variant="caption" style={{ color: c.success, fontSize: 11, fontWeight: '700' }}>{tr('✓ 發起人想讀')}</AppText></View>
          ) : !item.is_open ? (
            <View style={[styles.badge, { backgroundColor: c.surfaceMuted }]}><AppText variant="caption" muted style={{ fontSize: 11, fontWeight: '700' }}>{tr('已結案')}</AppText></View>
          ) : null}
          {onMore ? <MoreButton onPress={onMore} label={tr('{title}的更多動作', { title: item.title })} /> : null}
        </View>
        {'my_book' in item ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <BookCover title={item.my_book.title} url={item.my_book.cover_url} color="wisteria" size="sm" />
            <AppText variant="caption" muted style={{ flex: 1 }}>{tr('你開了《{title}》 · {n} 人參與', { title: item.my_book.title, n: item.reply_count })}</AppText>
          </View>
        ) : (
          <AppText variant="caption" style={{ color: item.wanted_count ? c.success : c.textSecondary }}>
            {[
              tr('{n} 張處方', { n: item.reply_count }),
              item.wanted_count ? tr('加入想讀 {n} 本', { n: item.wanted_count }) : null,
              item.is_open ? tr('還有 {n} 天', { n: daysLeft(item.closes_at, true) ?? 0 }) : tr('{date} 結案', { date: taipeiDate(item.closed_at ?? item.closes_at).md }),
              item.anonymous ? tr('匿名・書店頁看不到') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.sm },
});
