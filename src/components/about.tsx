import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { AppText, Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { about, useFirstVisit, type AboutKey } from '@/lib/about';
import { track } from '@/lib/analytics';
import { tr } from '@/lib/i18n';

export const openAbout = (key: AboutKey, from: 'intro' | 'link' | 'settings') => {
  track('about_opened', { feature: key, from });
  router.push({ pathname: '/about/[feature]', params: { feature: key } });
};

/** AH3 ② ／ v1.8.1 AJ2：小膠囊那一行最右邊的「？」圓鈕（點擊範圍 44pt，讀螢幕念「什麼是 xxx？」） */
export function AboutLink({ feature, style }: { feature: AboutKey; style?: object }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={tr('什麼是{name}？', { name: about(feature).name })}
      onPress={() => openAbout(feature, 'link')}
      style={({ pressed }) => [styles.help, { opacity: pressed ? 0.6 : 1 }, style]}>
      <Feather name="help-circle" size={20} color={c.primary} />
    </Pressable>
  );
}

/** AH3 ①：第一次進那個分頁，從下面滑出精簡版（只一次） */
export function AboutIntro({ feature }: { feature: AboutKey | null }) {
  const c = useTheme();
  const { show, dismiss } = useFirstVisit(feature);
  const a = show ? about(show) : null;
  return (
    <BottomSheet visible={!!show} onClose={dismiss} style={{ paddingHorizontal: Spacing.xl, gap: Spacing.md }}>
      {a && show ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
            <View style={[styles.icon, { backgroundColor: a.color }]}><Feather name={a.icon} size={22} color="#FFFFFF" /></View>
            <View style={{ flex: 1 }}>
              <AppText variant="heading">{tr('什麼是{name}？', { name: a.name })}</AppText>
              <AppText variant="caption" muted>{a.one}</AppText>
            </View>
          </View>
          <View style={{ gap: 4 }}>
            {a.steps.map((s, i) => <AppText key={s} style={{ lineHeight: 22 }}>{`${'①②③'[i]} ${s}`}</AppText>)}
          </View>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <Button kind="secondary" label={tr('看完整說明')} style={{ flex: 1 }} onPress={() => { dismiss(); openAbout(show, 'intro'); }} />
            <Button label={tr('知道了')} style={{ flex: 1 }} onPress={dismiss} />
          </View>
        </>
      ) : <View style={{ height: 1, backgroundColor: c.background }} />}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  help: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginVertical: -6, marginRight: -10 },
  icon: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
});
