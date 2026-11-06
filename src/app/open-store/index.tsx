import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing, StoreColors, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useCreateBookstore, useMyStore } from '@/lib/queries';

/** O2 開店步驟 1：基本資料。按「開店」即建立書店，接著 O3 第一檔策展 */
export default function OpenStoreScreen() {
  const c = useTheme();
  const { session } = useAuth();
  const { data: existing } = useMyStore();
  const create = useCreateBookstore();
  const displayName = (session?.user.user_metadata?.full_name as string | undefined) ?? '';
  const [name, setName] = useState(displayName ? `${displayName}的書店`.slice(0, 20) : '');
  const [ownerName, setOwnerName] = useState(displayName.slice(0, 20));
  const [color, setColor] = useState<StoreColor>('moss');

  useEffect(() => {
    if (existing) router.replace('/my-store'); // 已經有店：一人一店
  }, [existing]);

  const canSubmit = name.trim().length > 0 && ownerName.trim().length > 0;

  const submit = () =>
    create.mutate(
      { name: name.trim(), ownerName: ownerName.trim(), color },
      {
        onSuccess: () => router.replace('/open-store/curation'),
        onError: (e) => Alert.alert('開店沒有成功', e.message),
      },
    );

  const input = [styles.input, { borderColor: c.border, backgroundColor: c.surface, color: c.text }];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }}>
        <AppText variant="caption" muted>步驟 1 / 3 · 基本資料</AppText>
        <AppText variant="title">開一間書店</AppText>
        <AppText muted>先取個店名就能開店。策展、書架之後再補也可以。</AppText>

        <View style={[styles.preview, { backgroundColor: StoreColors[color].hex }]}>
          <AppText variant="heading" style={{ color: '#FFFFFF' }}>{name || '你的書店'}</AppText>
          <AppText variant="caption" style={{ color: '#FFFFFF' }}>{`店主 ${ownerName || '—'}`}</AppText>
        </View>

        <View style={{ gap: 6 }}>
          <AppText variant="label">{`書店名稱 · ${name.length} / 20`}</AppText>
          <TextInput accessibilityLabel="書店名稱" value={name} onChangeText={setName} maxLength={20} style={input} />
        </View>
        <View style={{ gap: 6 }}>
          <AppText variant="label">店主名稱</AppText>
          <TextInput accessibilityLabel="店主名稱" value={ownerName} onChangeText={setOwnerName} maxLength={20} style={input} />
        </View>

        <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
          <AppText variant="label">店面顏色</AppText>
          <View style={styles.swatches}>
            {(Object.keys(StoreColors) as StoreColor[]).map((key) => {
              const selected = key === color;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={StoreColors[key].label}
                  onPress={() => setColor(key)}
                  style={styles.swatch}>
                  <View style={[styles.dot, { backgroundColor: StoreColors[key].hex, borderColor: selected ? c.text : 'transparent' }]} />
                  <AppText variant="caption" style={{ fontWeight: selected ? '700' : '400' }}>{StoreColors[key].label}</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Button label="開店，下一步：第一檔策展" disabled={!canSubmit} loading={create.isPending} onPress={submit} />
        <Button kind="link" label="稍後再說，先去逛逛" onPress={() => router.navigate('/')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { borderRadius: Radius.xl, padding: Spacing.lg, gap: 2 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, fontSize: 16 },
  swatches: { flexDirection: 'row', justifyContent: 'space-between' },
  swatch: { alignItems: 'center', gap: 4, minWidth: MinTouch, minHeight: MinTouch },
  dot: { width: 40, height: 40, borderRadius: 20, borderWidth: 3 },
});
