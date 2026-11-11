import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { TextField, Toggle } from '@/components/form';
import { AppText, Button, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { REPORT_REASONS, safetyError, useReportStore, type ReportReason } from '@/lib/safety';
import { tr } from '@/lib/i18n';

/** A7 檢舉書店（可同時封鎖）。從 A8「封鎖並檢舉」進來時 blocked=1，已封鎖就不再顯示開關 */
export default function ReportStoreScreen() {
  const { id, name, blocked } = useLocalSearchParams<{ id: string; name?: string; blocked?: string }>();
  const c = useTheme();
  const report = useReportStore();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const alreadyBlocked = blocked === '1';

  const submit = () =>
    reason &&
    report.mutate(
      { bookstoreId: id, reason, detail, alsoBlock: alsoBlock && !alreadyBlocked },
      {
        onSuccess: () => {
          Alert.alert(tr('已送出檢舉'), tr('謝謝你。我們會在 24 小時內審核，對方不會知道是誰檢舉的。'));
          if (alsoBlock || alreadyBlocked) router.dismissAll();
          else router.back();
        },
        onError: (e) => Alert.alert(tr('沒有送出'), safetyError(e.message)),
      },
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('檢舉書店'), presentation: 'modal' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
          <AppText muted>{tr('檢舉「{p0}」的原因？我們會在 24 小時內審核，對方不會知道是誰檢舉的。', { p0: name ?? tr('這間書店') })}</AppText>
          <View accessibilityRole="radiogroup" style={{ gap: Spacing.sm }}>
            <AppText variant="label">{tr('檢舉原因')}</AppText>
            {REPORT_REASONS.map((r) => {
              const selected = reason === r.value;
              return (
                <Pressable
                  key={r.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setReason(r.value)}
                  style={[styles.option, { backgroundColor: c.surface, borderColor: selected ? c.primary : c.border }]}>
                  <View style={[styles.radio, { borderColor: selected ? c.primary : c.border }]}>
                    {selected ? <View style={[styles.radioDot, { backgroundColor: c.primary }]} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText style={{ fontWeight: selected ? '700' : '500' }}>{r.label}</AppText>
                    {r.sub ? <AppText variant="caption" muted>{r.sub}</AppText> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <TextField label={tr('補充說明')} optional multiline max={500} value={detail} onChangeText={setDetail} placeholder={tr('哪一檔策展、哪一段文字？')} />
          {alreadyBlocked ? (
            <View style={[styles.switchRow, { backgroundColor: c.successSurface }]}>
              <Feather name="check" size={18} color={c.success} />
              <AppText style={{ color: c.success, flex: 1 }}>{tr('已封鎖這位店主')}</AppText>
            </View>
          ) : (
            <View style={[styles.switchRow, { backgroundColor: c.surface }]}>
              <AppText style={{ flex: 1 }}>{tr('同時封鎖這位店主')}</AppText>
              <Toggle accessibilityLabel={tr('同時封鎖這位店主')} value={alsoBlock} onValueChange={setAlsoBlock} />
            </View>
          )}
          <Button kind="danger" label={tr('送出檢舉')} disabled={!reason} loading={report.isPending} onPress={submit} />
          <Button kind="link" label={tr('取消')} onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 52, borderWidth: 1.5, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg, minHeight: MinTouch },
});
