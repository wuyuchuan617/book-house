import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Toggle } from '@/components/form';
import { AppText, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { useMyStore, type StoreShow } from '@/lib/queries';
import { readingError, useUpdateStore } from '@/lib/readings';
import { tr } from '@/lib/i18n';

type Key = keyof StoreShow;

/** G3 公開設定：書店頁顯示哪幾類。一類關掉，書店頁整類看不到；打開後每一則還是看它自己公不公開 */
export default function StoreVisibilityScreen() {
  const c = useTheme();
  const { data } = useMyStore();
  const update = useUpdateStore();
  const [local, setLocal] = useState<Partial<StoreShow>>({});

  if (!data) return <ActivityIndicator style={{ marginTop: 48 }} />;
  const store = data.store;

  // 閱讀處方簽上線時再加 show_rx
  const rows: [Key, string, string][] = [
    ['show_reading', tr('正在讀／讀過'), tr('就是「店主閱讀」；每本書可以再個別設成私人')],
    ['show_want', tr('想讀的書'), tr('顯示書名、為什麼想讀、在哪看到；連結不公開')],
    ['show_place', tr('想去的地點'), tr('只顯示公開場所與原因；私人地點、連結不公開')],
    ['show_post', tr('日記貼文'), tr('只顯示設成「公開」的日記（含打卡）')],
  ];

  const set = (key: Key, value: boolean) => {
    track('store_visibility_changed', { key, value });
    setLocal((l) => ({ ...l, [key]: value }));
    update.mutate(
      { [key]: value },
      {
        onError: (e) => {
          setLocal((l) => ({ ...l, [key]: undefined }));
          Alert.alert(tr('沒有儲存成功'), readingError(e.message));
        },
      },
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('公開設定') }} />
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md }}>
        <AppText muted style={{ lineHeight: 22 }}>{tr('決定讀者在你的書店頁能看到什麼。關掉一類，那一類馬上從書店頁消失；打開後，每一則還是看它自己有沒有設成公開。')}</AppText>
        <Card style={{ paddingVertical: 0 }}>
          {rows.map(([key, label, sub], i) => (
            <View key={key} style={[styles.row, { borderBottomColor: c.divider, borderBottomWidth: i < rows.length - 1 ? StyleSheet.hairlineWidth : 0 }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label">{label}</AppText>
                <AppText variant="caption" muted style={{ lineHeight: 18 }}>{sub}</AppText>
              </View>
              <Toggle accessibilityLabel={label} value={local[key] ?? store[key]} onValueChange={(v) => set(key, v)} />
            </View>
          ))}
        </Card>
        <AppText variant="caption" muted style={{ lineHeight: 19 }}>{tr('自己在「我的書店」永遠看得到全部。想讀、想去、日記貼文會出現在書店頁的「店主手記」。')}</AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
});
