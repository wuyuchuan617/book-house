import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { tr } from '@/lib/i18n';
import { joinLines, recognizeLines } from '@/lib/text-scan';

export type ScanResult = { text: string; photo?: { uri: string; mimeType?: string | null } };

type Shot = { uri: string; mimeType?: string | null };

/**
 * R9 掃描書頁：拍照（或從相簿選）→ 手機上辨識 → 點選要節錄的行 → 放進摘句。
 * 照片預設不附上，要自己勾「也附上這張照片」。
 */
export function NoteScanSheet({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: (r: ScanResult) => void }) {
  const [shot, setShot] = useState<Shot | null>(null);
  const [lines, setLines] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [attach, setAttach] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setShot(null);
    setLines(null);
    setPicked(new Set());
    setAttach(false);
  };

  const take = async (source: 'camera' | 'library') => {
    try {
      const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(source === 'camera' ? tr('需要使用相機') : tr('需要讀取照片'), tr('可以到手機設定開啟權限。'));
        return;
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 };
      const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      setShot({ uri: a.uri, mimeType: a.mimeType });
      setBusy(true);
      const found = await recognizeLines(a.uri);
      setLines(found);
      setPicked(new Set());
      track('page_scanned', { lines: found.length });
    } catch {
      Alert.alert(tr('沒有辨識成功'), tr('換個角度、光線亮一點再拍一次。'));
    } finally {
      setBusy(false);
    }
  };

  // 打開就直接開相機
  // 等 Modal 動畫結束再開相機，否則 iOS 會開不起來
  useEffect(() => {
    if (!visible || shot) return;
    const t = setTimeout(() => void take('camera'), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const toggle = (i: number) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  const selectedText = lines ? joinLines([...picked].sort((a, b) => a - b).map((i) => lines[i])) : '';

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
      <View style={[styles.root]}>
        <SafeAreaView edges={['top']} style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={tr('關閉')} onPress={close} style={styles.icon}>
            <Feather name="x" size={24} color="#FFFFFF" />
          </Pressable>
          <AppText style={styles.title}>{tr('選要節錄的文字')}</AppText>
          <Pressable accessibilityRole="button" onPress={() => void take('camera')} style={styles.icon}>
            <AppText style={{ color: '#FFFFFF' }}>{tr('重拍')}</AppText>
          </Pressable>
        </SafeAreaView>

        {busy ? (
          <View style={styles.center}>
            <ActivityIndicator color="#FFFFFF" />
            <AppText style={{ color: '#CFC5B7', marginTop: Spacing.md }}>{tr('辨識中…')}</AppText>
          </View>
        ) : !shot ? (
          <View style={[styles.center, { gap: Spacing.md, paddingHorizontal: Spacing.xl }]}>
            <AppText style={{ color: '#CFC5B7', textAlign: 'center' }}>{tr('拍下書頁，把想節錄的那幾行選起來。')}</AppText>
            <Button label={tr('拍照')} onPress={() => void take('camera')} style={{ alignSelf: 'stretch' }} />
            <Button kind="secondary" label={tr('從相簿選')} onPress={() => void take('library')} style={{ alignSelf: 'stretch' }} />
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md }}>
              <Image source={{ uri: shot.uri }} style={styles.thumb} contentFit="cover" accessibilityLabel={tr('拍下的書頁')} />
              {lines && lines.length ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <AppText style={{ color: '#CFC5B7', flex: 1, fontSize: 13 }}>{tr('點一行選取，可以選很多行。辨識在手機上完成，照片不會上傳。')}</AppText>
                    <Pressable accessibilityRole="button" onPress={() => setPicked(picked.size === lines.length ? new Set() : new Set(lines.map((_, i) => i)))} style={{ paddingLeft: Spacing.md, minHeight: MinTouch, justifyContent: 'center' }}>
                      <AppText style={{ color: '#FFFFFF', fontWeight: '700' }}>{picked.size === lines.length ? tr('全部取消') : tr('全選')}</AppText>
                    </Pressable>
                  </View>
                  {lines.map((l, i) => {
                    const on = picked.has(i);
                    return (
                      <Pressable
                        key={`${i}-${l}`}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        onPress={() => toggle(i)}
                        style={[styles.line, on ? styles.lineOn : null]}>
                        <AppText style={{ color: on ? '#1F1B16' : '#F3EFE8', fontFamily: 'serif', fontSize: 16, lineHeight: 24 }}>{l}</AppText>
                      </Pressable>
                    );
                  })}
                </>
              ) : (
                <AppText style={{ color: '#CFC5B7' }}>{tr('沒有找到文字。換個角度、光線亮一點再拍一次。')}</AppText>
              )}
            </ScrollView>
            <SafeAreaView edges={['bottom']} style={styles.footer}>
              <AppText style={{ color: '#B8AE9F', fontSize: 12 }}>{tr('已選 {n} 行 · {c} 字', { n: picked.size, c: [...selectedText].length })}</AppText>
              {selectedText ? <AppText numberOfLines={3} style={{ color: '#FFFFFF', fontFamily: 'serif', lineHeight: 22 }}>{selectedText}</AppText> : null}
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: attach }} onPress={() => setAttach(!attach)} style={styles.attach}>
                <View style={[styles.box, attach && { backgroundColor: '#FFFFFF' }]}>{attach ? <Feather name="check" size={14} color="#1F1B16" /> : null}</View>
                <AppText style={{ color: '#CFC5B7', fontSize: 13 }}>{tr('也附上這張照片')}</AppText>
              </Pressable>
              <Button
                label={tr('放進摘句')}
                disabled={!selectedText}
                onPress={() => {
                  onDone({ text: selectedText, photo: attach ? shot : undefined });
                  reset();
                }}
              />
            </SafeAreaView>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#12100D' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md },
  icon: { minWidth: MinTouch, height: MinTouch, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: '100%', height: 160, borderRadius: Radius.md, backgroundColor: '#2A251F' },
  line: { borderRadius: 8, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  lineOn: { backgroundColor: '#F2C9A8', borderColor: '#E8855E' },
  footer: { backgroundColor: '#1F1B16', paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing.sm, gap: Spacing.sm },
  attach: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: MinTouch },
  box: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#8F8577', alignItems: 'center', justifyContent: 'center' },
});
