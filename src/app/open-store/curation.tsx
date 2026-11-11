import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Chip, chipRow, TextField } from '@/components/form';
import { AppText, Button, Screen } from '@/components/ui';
import { MinTouch, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DESCRIPTION_MAX, friendlyError, TITLE_MAX, useCreateCuration, useUpdateCuration } from '@/lib/curations';
import { currentPeriod, periodLabel } from '@/lib/period';
import { track } from '@/lib/analytics';
import { useMyStore } from '@/lib/queries';
import { tr } from '@/lib/i18n';

const TEMPLATES = () => [tr('適合冬天讀的書'), tr('今年最喜歡的 3 本'), tr('改變我想法的書'), tr('送給新手的入門書')];

/** O3 開店步驟 2：第一檔策展（可略過） */
export default function OpenStoreCurationScreen() {
  const c = useTheme();
  const { data: store } = useMyStore();
  const create = useCreateCuration();
  const update = useUpdateCuration();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const period = currentPeriod();

  const next = async () => {
    try {
      const cur = await create.mutateAsync({ period, title, description });
      // 同月已有草稿時 create 會回傳那份，這裡把剛填的內容寫進去
      await update.mutateAsync({ id: cur.id, title, description });
      router.push({ pathname: '/open-store/shelf', params: { id: cur.id } });
    } catch (e) {
      Alert.alert(tr('沒有成功'), friendlyError((e as Error).message));
    }
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: tr('開店'),
          headerBackVisible: false,
          gestureEnabled: false,
          headerRight: () => (
            <Pressable accessibilityRole="button" onPress={() => { track('onboarding_step_skipped', { step: 2 }); router.replace({ pathname: '/open-store/done', params: { skipped: '1' } }); }} style={styles.skip}>
              <AppText style={{ color: c.primary, fontWeight: '700' }}>{tr('略過')}</AppText>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
          <AppText variant="caption" muted>{tr('步驟 2 / 3 · 第一檔策展')}</AppText>
          <View style={[styles.done, { backgroundColor: c.successSurface }]}>
            <AppText variant="caption" style={{ color: c.success, fontWeight: '700' }}>{tr('✓ 「{p0}」已開張', { p0: store?.store.name ?? tr('你的書店') })}</AppText>
          </View>
          <AppText variant="title">{tr('這個月想推薦什麼？')}</AppText>
          <AppText muted>{tr('每月一檔，用一個主題把幾本書串起來。')}</AppText>

          <View style={{ gap: 4 }}>
            <AppText variant="label">{tr('策展月份')}</AppText>
            <AppText style={{ fontSize: 16, fontWeight: '600' }}>
              {periodLabel(period)}
              <AppText muted>{tr('（本月）')}</AppText>
            </AppText>
          </View>

          <TextField label={tr('策展標題')} max={TITLE_MAX} value={title} onChangeText={setTitle} placeholder={tr('例如：冬天的星空指南')} />
          <View style={{ gap: Spacing.sm }}>
            <AppText variant="caption" muted>{tr('沒想法？從範本開始')}</AppText>
            <View style={chipRow}>
              {TEMPLATES().map((t) => <Chip key={t} label={t} selected={title === t} onPress={() => setTitle(t)} />)}
            </View>
          </View>
          <TextField label={tr('策展說明')} optional multiline max={DESCRIPTION_MAX} value={description} onChangeText={setDescription} placeholder={tr('這個月為什麼選這些書？')} />

          <Button label={tr('下一步：放上書架')} disabled={!title.trim()} loading={create.isPending || update.isPending} onPress={next} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skip: { minHeight: MinTouch, minWidth: MinTouch, justifyContent: 'center', alignItems: 'flex-end' },
  done: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
});
