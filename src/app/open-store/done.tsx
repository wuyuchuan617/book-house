import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing, StoreColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError, sortedItems, useCreateCuration, useCuration } from '@/lib/curations';
import { currentPeriod, monthOf } from '@/lib/period';
import { track } from '@/lib/analytics';
import { useMyStore } from '@/lib/queries';
import { useMyReadings } from '@/lib/readings';
import { shareStoreMessage, storeLinkLabel } from '@/lib/links';
import { tr } from '@/lib/i18n';

type Task = { label: string; done: boolean; onPress?: () => void; soon?: boolean };

/** O5 開張完成／O6 略過策展／O9 清單全部完成 */
export default function OpenStoreDoneScreen() {
  const { id } = useLocalSearchParams<{ id?: string; skipped?: string }>();
  const c = useTheme();
  const { data: store } = useMyStore();
  const { data: cur, isLoading } = useCuration(id);
  const create = useCreateCuration();
  const { data: readings } = useMyReadings();

  if (!store || (id && isLoading)) return <ActivityIndicator style={{ marginTop: 48 }} />;

  const color = StoreColors[store.store.color].hex;
  const items = cur ? sortedItems(cur) : [];
  const published = cur?.status === 'published';
  const link = storeLinkLabel(store.store.slug);
  const month = monthOf(cur?.period ?? currentPeriod());

  const tasks: Task[] = published
    ? [
        { label: tr('發布第一檔策展'), done: true },
        {
          label: tr('替 {length} 本書寫推薦理由', { length: items.length }),
          done: items.every((it) => !!it.note),
          onPress: () => router.push({ pathname: '/open-store/reasons', params: { id: cur!.id } }),
        },
        {
          label: tr('記錄一本正在讀的書'),
          done: (readings?.length ?? 0) > 0,
          onPress: () => router.push({ pathname: '/reading/new', params: { from: 'open-store' } }),
        },
      ]
    : [
        { label: tr('取一個策展標題'), done: !!cur?.title },
        { label: tr('放上至少 1 本書'), done: items.length > 0 },
      ];
  const doneCount = tasks.filter((t) => t.done).length;
  const allDone = published && tasks.every((t) => t.done);

  const continueDraft = () => {
    if (cur) return router.replace({ pathname: '/curation/[id]', params: { id: cur.id } });
    create.mutate(
      { period: currentPeriod() },
      {
        onSuccess: (r) => router.replace({ pathname: '/curation/[id]', params: { id: r.id } }),
        onError: (e) => Alert.alert(tr('沒有成功'), friendlyError(e.message)),
      },
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: '', headerBackVisible: false, gestureEnabled: false }} />
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }}>
        <AppText variant="title" style={{ textAlign: 'center' }}>{tr('書店開張了')}</AppText>
        <AppText muted style={{ textAlign: 'center' }}>
          {!published
            ? tr('發布第一檔策展後，讀者才會在探索頁看到你。')
            : allDone
              ? tr('書店都準備好了！讀者現在可以在探索頁看到你')
              : tr('讀者現在可以在探索頁看到你的第一檔策展')}
        </AppText>

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <View style={[styles.cover, { backgroundColor: color }]}>
            {published ? (
              <>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {items.slice(0, 3).map((it) => (
                    <BookCover key={it.id} title={it.books.title} url={it.books.cover_url} color={store.store.color} size="sm" />
                  ))}
                </View>
                <AppText variant="caption" style={{ color: '#FFFFFF' }}>{tr('{length} 本書', { length: items.length })}</AppText>
                <AppText variant="heading" style={{ color: '#FFFFFF' }}>{cur!.title}</AppText>
              </>
            ) : (
              <AppText variant="caption" style={{ color: '#FFFFFF' }}>{tr('策展封面會出現在這裡')}</AppText>
            )}
          </View>
          <View style={{ padding: Spacing.lg, gap: 4 }}>
            <AppText variant="label">{store.store.name}</AppText>
            <AppText variant="caption" muted>{published ? tr('{month} 月策展', { month }) : tr('{month} 月策展 · 尚未發布 · 讀者暫時看不到', { month })}</AppText>
            {published && store.store.slug.startsWith('store-') ? (
              <Button kind="link" label={tr('幫書店取一個好記的網址')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0, minHeight: MinTouch }} onPress={() => router.push('/store-edit')} />
            ) : null}
            {published ? (
              <View style={styles.linkRow}>
                <AppText variant="caption" style={{ flex: 1 }} selectable>{link}</AppText>
                <Button
                  kind="secondary"
                  label={tr('分享')}
                  style={{ minHeight: MinTouch }}
                  onPress={() => { track('share_link_copied', { channel: 'system' }); void Share.share({ message: shareStoreMessage(store.store.name, store.store.slug) }); }}
                />
              </View>
            ) : null}
          </View>
        </Card>

        <View style={{ gap: Spacing.sm }}>
          <AppText variant="label">
            {published
              ? tr('讓書店更完整 · {doneCount} / {length}{p2}', { doneCount, length: tasks.length, p2: allDone ? ' ✓' : '' })
              : doneCount === tasks.length
                ? tr('第一檔策展準備好了，發布就完成')
                : tr('發布第一檔策展 · 還差 {p0} 步', { p0: tasks.length - doneCount })}
          </AppText>
          {tasks.map((t) => (
            <Pressable
              key={t.label}
              accessibilityRole={t.onPress && !t.done ? 'button' : undefined}
              accessibilityState={{ checked: t.done, disabled: !t.onPress || t.done }}
              disabled={!t.onPress || t.done}
              onPress={t.onPress}
              style={[styles.task, { backgroundColor: c.surface }]}>
              <View style={[styles.check, t.done ? { backgroundColor: c.success, borderColor: c.success } : { borderColor: c.border }]}>
                {t.done ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
              </View>
              <AppText style={{ flex: 1, textDecorationLine: t.done ? 'line-through' : 'none', color: t.done ? c.textSecondary : c.text }}>{t.label}</AppText>
              {t.soon ? <AppText variant="caption" muted>{tr('即將推出')}</AppText> : t.onPress && !t.done ? <Feather name="chevron-right" size={18} color={c.textTertiary} /> : null}
            </Pressable>
          ))}
          {!published && cur ? <AppText variant="caption" muted>{tr('你填過的內容已存成草稿，接著完成就好。')}</AppText> : null}
        </View>

        {published ? (
          <Button label={tr('前往我的書店')} onPress={() => router.navigate('/my-store')} />
        ) : (
          <>
            <Button label={doneCount === tasks.length ? tr('去發布第一檔策展') : tr('完成第一檔策展')} loading={create.isPending} onPress={continueDraft} />
            <Button kind="link" label={tr('先去我的書店看看')} onPress={() => router.navigate('/my-store')} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cover: { minHeight: 150, padding: Spacing.lg, justifyContent: 'flex-end', gap: 4 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.sm },
  task: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 52, paddingHorizontal: Spacing.lg, borderRadius: Radius.lg },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
