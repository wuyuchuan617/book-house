import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { SignInButtons } from '@/components/sign-in-buttons';
import { AppText, Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';

/** A9 訪客登入引導：登入後 AuthProvider 會自動完成剛才的動作 */
export function LoginGate() {
  const { session, pendingAction, cancelPending } = useAuth();
  const c = useTheme();
  const visible = !session && !!pendingAction;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={cancelPending}>
      <Pressable style={styles.backdrop} onPress={cancelPending} accessibilityLabel="關閉登入引導" />
      <View style={[styles.sheet, { backgroundColor: c.surface }]}>
        <AppText variant="heading" style={styles.center}>登入後就能繼續</AppText>
        <AppText muted style={[styles.center, { marginTop: Spacing.sm, marginBottom: Spacing.xl }]}>
          登入後會自動幫你完成剛才的動作，不用再按一次。
        </AppText>
        <SignInButtons />
        <Button kind="link" label="繼續逛逛" onPress={cancelPending} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(31,27,22,0.45)' },
  sheet: { padding: Spacing.xl, paddingBottom: 36, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  center: { textAlign: 'center' },
});
