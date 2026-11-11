import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '@/components/form';
import { AppText, Button, Card } from '@/components/ui';
import { Spacing, StoreColors, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import type { MyStore } from '@/lib/queries';
import { readingError, useUpdateStore } from '@/lib/readings';
import { tr } from '@/lib/i18n';

/** G0 書店自動開好：第一次進「我的書店」跳出來，可以改名字、顏色，或之後再說（看過就不再出現） */
export function StoreSetupSheet({ store }: { store: MyStore }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const update = useUpdateStore();
  const [dismissed, setDismissed] = useState(false);
  const [name, setName] = useState(store.name);
  const [color, setColor] = useState<StoreColor>(store.color);
  const visible = !store.setup_done && !dismissed;

  const finish = (patch: { name?: string; color?: StoreColor }, then?: () => void) => {
    setDismissed(true);
    update.mutate(
      { ...patch, setup_done: true },
      {
        onSuccess: () => {
          track('store_auto_setup', { renamed: !!patch.name && patch.name !== store.name, recolored: !!patch.color && patch.color !== store.color });
          then?.();
        },
        onError: (e) => {
          setDismissed(false);
          Alert.alert(tr('沒有儲存成功'), readingError(e.message));
        },
      },
    );
  };

  const save = (then?: () => void) => finish({ ...(name.trim() && name.trim() !== store.name ? { name: name.trim() } : {}), ...(color !== store.color ? { color } : {}) }, then);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => finish({})}>
      <Pressable style={styles.backdrop} onPress={() => finish({})} accessibilityLabel={tr('之後再說')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { backgroundColor: c.background, paddingBottom: Math.max(insets.bottom, 16) + Spacing.sm }]}>
          <View style={[styles.grabber, { backgroundColor: c.border }]} />
          <AppText variant="title" style={{ fontSize: 22 }}>{tr('你的書店已經開好了')}</AppText>
          <AppText muted style={{ lineHeight: 22 }}>{tr('每個人都有一間小書店：放你推薦的書、正在讀的書，和公開的貼文。名字和顏色隨時可以改。')}</AppText>
          <TextField label={tr('書店名稱')} value={name} onChangeText={setName} max={20} />
          <View style={{ gap: Spacing.sm }}>
            <AppText variant="label">{tr('顏色')}</AppText>
            <View style={{ flexDirection: 'row', gap: Spacing.md }} accessibilityRole="radiogroup">
              {(Object.keys(StoreColors) as StoreColor[]).map((k) => {
                const selected = k === color;
                return (
                  <Pressable
                    key={k}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={StoreColors[k].label}
                    onPress={() => setColor(k)}
                    style={[styles.dot, { backgroundColor: StoreColors[k].hex, borderColor: selected ? c.text : 'transparent' }]}
                  />
                );
              })}
            </View>
          </View>
          <Card style={{ gap: 4 }}>
            <AppText variant="caption" style={{ lineHeight: 19 }}>{tr('書店頁會顯示：正在讀、公開的日記貼文')}</AppText>
            <AppText variant="caption" muted style={{ lineHeight: 19 }}>{tr('不會顯示：想讀、想去、只有自己的日記')}</AppText>
            <Pressable accessibilityRole="link" onPress={() => save(() => router.push('/store-visibility'))}>
              <AppText variant="caption" style={{ color: c.primary, fontWeight: '700', marginTop: 2 }}>{tr('改公開設定 ›')}</AppText>
            </Pressable>
          </Card>
          <Button label={tr('好，開始逛')} disabled={!name.trim()} loading={update.isPending} onPress={() => save()} />
          <Button kind="link" label={tr('之後再說')} onPress={() => finish({})} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(31,27,22,0.45)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: Spacing.xs },
  dot: { width: 38, height: 38, borderRadius: 19, borderWidth: 3 },
});
