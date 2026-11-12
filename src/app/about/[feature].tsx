import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { about, ABOUT_KEYS, type AboutKey } from '@/lib/about';
import { useAuth } from '@/lib/auth';
import { tr } from '@/lib/i18n';

/** v1.8 AH1「什麼是 xxx？」：主題色卡（一句話）→ 怎麼用 → 誰看得到 → 小提醒；最下面「開始用」 */
export default function AboutScreen() {
  const { feature } = useLocalSearchParams<{ feature: string }>();
  const c = useTheme();
  const { requireAuth } = useAuth();
  if (!ABOUT_KEYS.includes(feature as AboutKey)) return <EmptyState title={tr('找不到這頁說明')} body={tr('回上一頁再試一次。')} />;
  const a = about(feature as AboutKey);
  return (
    <Screen>
      <Stack.Screen options={{ title: tr('什麼是{name}？', { name: a.name }) }} />
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md, paddingBottom: 24 }}>
        <View style={[styles.hero, { backgroundColor: a.color }]}>
          <View style={styles.heroIcon}><Feather name={a.icon} size={24} color="#FFFFFF" /></View>
          <AppText variant="title" style={{ color: '#FFFFFF', fontSize: 22 }}>{a.name}</AppText>
          <AppText style={{ color: '#FFFFFF', opacity: 0.92, lineHeight: 23 }}>{a.one}</AppText>
        </View>
        <Section icon="check" color={a.color} title={tr('怎麼用')}>
          {a.steps.map((s, i) => (
            <View key={s} style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' }}>
              <View style={[styles.num, { backgroundColor: a.color }]}><AppText variant="caption" style={{ color: '#FFFFFF', fontWeight: '700' }}>{String(i + 1)}</AppText></View>
              <AppText style={{ flex: 1, lineHeight: 22 }}>{s}</AppText>
            </View>
          ))}
        </Section>
        <Section icon="eye" color={a.color} title={tr('誰看得到')}>
          <AppText style={{ lineHeight: 22 }}>{a.who}</AppText>
        </Section>
        <Section icon="info" color={a.color} title={a.tipLabel}>
          <AppText style={{ lineHeight: 22 }}>{a.tip}</AppText>
        </Section>
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Button label={a.start} onPress={() => requireAuth(() => router.push(a.href))} />
      </SafeAreaView>
    </Screen>
  );
}

function Section({ icon, color, title, children }: { icon: React.ComponentProps<typeof Feather>['name']; color: string; title: string; children: React.ReactNode }) {
  return (
    <Card style={{ gap: Spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Feather name={icon} size={15} color={color} />
        <AppText variant="label">{title}</AppText>
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: Radius.xl, padding: Spacing.xl, gap: Spacing.sm },
  heroIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  num: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  footer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
