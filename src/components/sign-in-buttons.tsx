import * as AppleAuthentication from 'expo-apple-authentication';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { tr } from '@/lib/i18n';

/** A1、A9 共用：Apple（iOS）＋ Google。App Store 4.8：有第三方登入就要有 Apple。 */
export function SignInButtons() {
  const { signInWithApple, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);

  const run = async (which: 'apple' | 'google') => {
    setBusy(which);
    try {
      await (which === 'apple' ? signInWithApple() : signInWithGoogle());
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert(tr('登入沒有成功'), e instanceof Error ? e.message : tr('請稍後再試一次'));
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.stack}>
      {Platform.OS === 'ios' ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={Radius.lg}
          style={styles.apple}
          onPress={() => run('apple')}
        />
      ) : null}
      <Button kind="secondary" label={tr('使用 Google 繼續')} loading={busy === 'google'} onPress={() => run('google')} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.sm + 2 },
  apple: { height: 52 },
});
