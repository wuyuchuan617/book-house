import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing, StoreColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useMyStore } from '@/lib/queries';

/** 未開店 → O1 入口；已開店 → M1 我的書店。TODO(M2)：C1–C8 策展 CRUD、R1–R7 店主閱讀 */
export default function MyStoreScreen() {
  const c = useTheme();
  const { session, requireAuth } = useAuth();
  const { data, isLoading } = useMyStore();

  return (
    <Screen>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={styles.header}>
          <AppText variant="title">我的書店</AppText>
          {session ? (
            <Pressable accessibilityRole="button" accessibilityLabel="設定" onPress={() => router.push('/settings')} style={styles.icon}>
              <Feather name="settings" size={20} color={c.text} />
            </Pressable>
          ) : null}
        </View>

        {!session ? (
          <EmptyState title="開一間只屬於你的書店" body="登入後就能開店，三個步驟、大約 3 分鐘。" actionLabel="登入" onAction={() => requireAuth(() => router.push('/open-store'))} />
        ) : isLoading ? (
          <ActivityIndicator style={{ marginTop: 48 }} />
        ) : !data ? (
          <OpenStoreIntro />
        ) : (
          <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md }}>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <View style={{ height: 64, backgroundColor: StoreColors[data.store.color].hex }} />
              <View style={{ padding: Spacing.lg }}>
                <AppText variant="heading">{data.store.name}</AppText>
                <AppText variant="caption" muted>{`bookhaus.app/${data.store.slug}`}</AppText>
                <View style={[styles.stats, { borderTopColor: c.divider }]}>
                  <Stat label="追蹤" value={data.stats?.follower_count ?? 0} />
                  <Stat label="本月拜訪" value={data.stats?.visits_this_month ?? 0} />
                  <Stat label="檔策展" value={data.stats?.published_curation_count ?? 0} />
                </View>
              </View>
            </Card>
            {data.curations.length === 0 ? (
              <Card>
                <AppText variant="heading">{`${new Date().getMonth() + 1} 月還沒有策展`}</AppText>
                <AppText muted style={{ marginTop: Spacing.xs }}>發布前讀者看不到你的書店。挑一個主題，放上一本書就能發布。</AppText>
                {/* TODO(M2)：C1 新增策展 */}
                <Button label="新增本月策展（開發中）" disabled style={{ marginTop: Spacing.lg }} />
              </Card>
            ) : (
              data.curations.map((cur) => (
                <Card key={cur.id}>
                  <AppText variant="caption" muted>{`${cur.period.slice(0, 7)} · ${cur.status === 'published' ? '已發布' : '草稿'}`}</AppText>
                  <AppText variant="label" style={{ marginTop: 4 }}>{cur.title ?? '（未命名）'}</AppText>
                </Card>
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Screen>
  );
}

function OpenStoreIntro() {
  const steps = [
    ['取店名、選店面顏色', '完成這步，書店就開張了'],
    ['想好這個月的策展主題', '有範本可以挑 · 可略過'],
    ['放上第一本書', '1 本就能發布 · 可略過'],
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }}>
      <AppText variant="heading">開一間只屬於你的書店</AppText>
      <AppText muted>三個步驟、大約 3 分鐘。除了店名，其他都能之後再補。</AppText>
      {steps.map(([t, s], i) => (
        <View key={t} style={{ flexDirection: 'row', gap: Spacing.md }}>
          <AppText variant="label">{i + 1}</AppText>
          <View>
            <AppText variant="label">{t}</AppText>
            <AppText variant="caption" muted>{s}</AppText>
          </View>
        </View>
      ))}
      <Button label="開始開店" onPress={() => router.push('/open-store')} />
      <Button kind="link" label="先看看別人的書店" onPress={() => router.navigate('/')} />
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <AppText style={{ fontSize: 17, fontWeight: '700' }}>{String(value)}</AppText>
      <AppText variant="caption" muted>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icon: { width: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill },
  stats: { flexDirection: 'row', marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1 },
});
