import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';

/** 掃書背的 ISBN 條碼（EAN-13，978／979 開頭）；掃到就回傳 13 碼 ISBN */
export function IsbnScanner({ visible, onClose, onScanned }: { visible: boolean; onClose: () => void; onScanned: (isbn: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const done = useRef(false);

  const handle = ({ data }: { data: string }) => {
    const digits = data.replace(/[^0-9]/g, '');
    if (done.current || !/^97[89][0-9]{10}$/.test(digits)) return;
    done.current = true;
    onScanned(digits);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} onShow={() => { done.current = false; }}>
      <View style={styles.root}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13'] }}
            onBarcodeScanned={handle}
          />
        ) : null}
        <SafeAreaView style={styles.overlay}>
          <View style={styles.top}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
              <AppText style={{ color: '#FFFFFF', fontWeight: '700' }}>取消</AppText>
            </Pressable>
          </View>
          {permission?.granted ? (
            <View style={{ alignItems: 'center', gap: Spacing.lg }}>
              <View style={styles.frame} accessible={false} />
              <AppText style={{ color: '#FFFFFF', textAlign: 'center' }}>{'把書背的條碼放進框裡\n通常在封底右下角，978 開頭'}</AppText>
            </View>
          ) : (
            <View style={styles.ask}>
              <AppText style={{ color: '#FFFFFF', textAlign: 'center' }}>需要使用相機才能掃描書背條碼。</AppText>
              {permission?.canAskAgain === false ? (
                <Button label="到設定開啟相機" onPress={() => void Linking.openSettings()} />
              ) : (
                <Button label="允許使用相機" onPress={() => void requestPermission()} />
              )}
            </View>
          )}
          <View />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  top: { flexDirection: 'row', justifyContent: 'flex-end', padding: Spacing.md },
  close: { minHeight: MinTouch, minWidth: MinTouch, justifyContent: 'center', paddingHorizontal: Spacing.md },
  frame: { width: 280, height: 140, borderRadius: Radius.lg, borderWidth: 3, borderColor: '#FFFFFF' },
  ask: { padding: Spacing.xl, gap: Spacing.lg },
});
