import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SignInButtons } from '@/components/sign-in-buttons';
import { AppText, Button, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

/** A1 歡迎／登入：可以先逛逛，不強迫登入 */
export default function SignInScreen() {
  const { session } = useAuth();

  useEffect(() => {
    if (session) router.back();
  }, [session]);

  const points = [
    ['每月一檔主題策展', '店主親選，附上為什麼推薦'],
    ['追蹤喜歡的書店', '新策展上架時第一個知道'],
    ['開一間自己的書店', '一分鐘建立，之後慢慢補書架'],
  ];

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1, padding: 28 }}>
        <View style={{ flex: 1, justifyContent: 'center', gap: Spacing.xl }}>
          <View style={{ alignItems: 'center', gap: Spacing.sm }}>
            <AppText variant="title" style={{ fontSize: 34 }}>書棲</AppText>
            <AppText muted>每月一檔策展，開一間你的獨立書店</AppText>
          </View>
          <View style={{ gap: Spacing.lg }}>
            {points.map(([t, s]) => (
              <View key={t}>
                <AppText variant="label" style={{ fontSize: 15 }}>{t}</AppText>
                <AppText variant="caption" muted>{s}</AppText>
              </View>
            ))}
          </View>
        </View>
        <SignInButtons />
        <Button kind="link" label="先逛逛，稍後再登入" onPress={() => router.back()} style={styles.later} />
        <AppText variant="caption" muted style={{ textAlign: 'center' }}>繼續即表示同意服務條款與隱私權政策</AppText>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  later: { minHeight: 48, marginTop: Spacing.xs },
});
