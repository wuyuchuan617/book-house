import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, chipRow, TextField } from '@/components/form';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';
import { useMyStore } from '@/lib/queries';
import { RX_BODY_MAX, RX_DURATIONS, RX_TAGS, RX_TITLE_MAX, rxError, rxTagLabel, useCreateRx, useRx, useUpdateRx, type RxDetail, type RxDuration } from '@/lib/rx';

/** X2 發起閱讀處方簽：狀況（必填）、想多說一點、標籤（最多 3）、身分（書店／匿名）、開放多久；帶 id = 編輯（還沒有人開才行） */
export default function NewRxScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data, isLoading } = useRx(id);
  if (id && isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  return <RxForm existing={id ? data ?? undefined : undefined} />;
}

function RxForm({ existing }: { existing?: RxDetail }) {
  const c = useTheme();
  const { data: mine } = useMyStore();
  const create = useCreateRx();
  const update = useUpdateRx();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [duration, setDuration] = useState<RxDuration>(14);

  const toggleTag = (t: string) => setTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : ts.length >= 3 ? ts : [...ts, t]));
  const addTag = () => {
    const t = draft.trim().slice(0, 10);
    setAdding(false);
    setDraft('');
    if (t && !tags.includes(t) && tags.length < 3) setTags([...tags, t]);
  };
  const submit = () =>
    existing
      ? update.mutate({ id: existing.id, title, body, tags }, { onSuccess: () => router.back(), onError: (e) => Alert.alert(tr('沒有儲存成功'), rxError(e.message)) })
      : create.mutate(
      { title, body, tags, anonymous, duration },
      {
        onSuccess: (r) => router.replace({ pathname: '/rx/[id]', params: { id: r.id } }),
        onError: (e) => Alert.alert(tr('沒有發起成功'), rxError(e.message)),
      },
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? tr('編輯處方簽') : tr('發起閱讀處方簽') }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
          <AppText muted style={{ lineHeight: 22 }}>{tr('說說你現在的狀況或想找什麼書，大家會各開一本給你。')}</AppText>
          <TextField label={tr('你的狀況')} multiline max={RX_TITLE_MAX} value={title} onChangeText={setTitle} placeholder={tr('例如：最近工作很累，想讀不用動腦、但不空洞的小說')} />
          <TextField label={tr('想多說一點')} optional multiline max={RX_BODY_MAX} value={body} onChangeText={setBody} placeholder={tr('喜歡過的書、不想要的類型、想在哪裡讀…')} />
          <View style={{ gap: Spacing.sm }}>
            <AppText variant="label">
              {tr('標籤')}
              <AppText variant="caption" muted>{tr('  選填 · 最多 3 個')}</AppText>
            </AppText>
            <View style={chipRow}>
              {[...RX_TAGS, ...tags.filter((t) => !(RX_TAGS as readonly string[]).includes(t))].map((t) => (
                <Chip key={t} label={rxTagLabel(t)} selected={tags.includes(t)} onPress={() => toggleTag(t)} />
              ))}
              {adding ? (
                <TextInput
                  autoFocus
                  value={draft}
                  onChangeText={setDraft}
                  maxLength={10}
                  onSubmitEditing={addTag}
                  onBlur={addTag}
                  placeholder={tr('例如：通勤讀物')}
                  placeholderTextColor={c.textTertiary}
                  accessibilityLabel={tr('自己新增標籤')}
                  style={[styles.tagInput, { borderColor: c.primary, color: c.text, backgroundColor: c.surface }]}
                />
              ) : tags.length < 3 ? (
                <Chip label={tr('＋ 自己新增')} onPress={() => setAdding(true)} />
              ) : null}
            </View>
          </View>
          {!existing ? (
          <>
          <View style={{ gap: Spacing.sm }}>
            <AppText variant="label">{tr('用什麼身分')}</AppText>
            <View style={chipRow}>
              <Chip label={mine?.store.name ?? tr('我的書店')} selected={!anonymous} onPress={() => setAnonymous(false)} />
              <Chip label={tr('一位讀者（匿名）')} selected={anonymous} onPress={() => setAnonymous(true)} />
            </View>
            <AppText variant="caption" muted>{anonymous ? tr('匿名時別人看不到是誰發起的，也不會出現在你的書店頁。') : tr('大家會看到是你的書店發起的，可以點進你的書店。')}</AppText>
          </View>
          <View style={{ gap: Spacing.sm }}>
            <AppText variant="label">{tr('開放多久')}</AppText>
            <View style={chipRow}>
              {RX_DURATIONS.map((d) => <Chip key={d} label={tr('{n} 天', { n: d })} selected={duration === d} onPress={() => setDuration(d)} />)}
            </View>
            <AppText variant="caption" muted>{tr('時間到自動結案，之後只能看；也可以提早結案、或延長一次。')}</AppText>
          </View>
          </>
          ) : (
            <AppText variant="caption" muted>{tr('還沒有人開處方，可以修改內容；身分和開放天數不能改。')}</AppText>
          )}
          <Card style={{ backgroundColor: c.surfaceMuted }}>
            <AppText variant="caption" muted style={{ lineHeight: 19 }}>{tr('有人開處方會通知你。每個人只能開一本，所以不會被洗版。')}</AppText>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
      <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Button label={existing ? tr('儲存') : tr('發起')} disabled={!title.trim()} loading={create.isPending || update.isPending} onPress={submit} />
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tagInput: { minWidth: 120, height: 36, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, fontSize: 14 },
  footer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
