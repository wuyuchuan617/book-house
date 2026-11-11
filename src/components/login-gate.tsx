import { StyleSheet } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { SignInButtons } from '@/components/sign-in-buttons';
import { AppText, Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { tr } from '@/lib/i18n';

/** A9 訪客登入引導：登入後 AuthProvider 會自動完成剛才的動作 */
export function LoginGate() {
  const { session, pendingAction, cancelPending } = useAuth();
  const visible = !session && !!pendingAction;

  return (
    <BottomSheet visible={visible} onClose={cancelPending} closeLabel={tr('關閉登入引導')} surface="surface" style={styles.sheet}>
        <AppText variant="heading" style={styles.center}>{tr('登入後就能繼續')}</AppText>
        <AppText muted style={[styles.center, { marginTop: Spacing.sm, marginBottom: Spacing.xl }]}>
          
          {tr('登入後會自動幫你完成剛才的動作，不用再按一次。')}
        </AppText>
        <SignInButtons />
        <Button kind="link" label={tr('繼續逛逛')} onPress={cancelPending} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: Spacing.xl, paddingBottom: 36 },
  center: { textAlign: 'center' },
});
