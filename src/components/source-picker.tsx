import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/components/form';
import { AppText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';

const KEY = 'bookhaus.want-sources.v1';
const SEP = '・';

export const SOURCE_SUGGESTIONS = () => [tr('朋友推薦'), tr('書店'), 'Instagram', 'Threads', 'Podcast', tr('讀書會')];

/** 「Instagram・@小令的書單」→ { chip: 'Instagram', detail: '@小令的書單' }；不認得的整段當成補一句 */
export function splitSource(value: string, chips: string[]) {
  const v = value.trim();
  if (!v) return { chip: '', detail: '' };
  const i = v.indexOf(SEP);
  const head = i >= 0 ? v.slice(0, i) : v;
  if (chips.includes(head)) return { chip: head, detail: i >= 0 ? v.slice(i + 1) : '' };
  return { chip: '', detail: v };
}

export const joinSource = (chip: string, detail: string) => [chip.trim(), detail.trim()].filter(Boolean).join(SEP).slice(0, 60);

/**
 * v1.6 在哪看到：一行可以橫滑的選項（常用的排前面，最後一個「＋ 自己新增」，新增的會記住）；
 * 選了選項才出現下面那行「補一句」。
 */
export function SourcePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = useTheme();
  const [custom, setCustom] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const chips = [...SOURCE_SUGGESTIONS(), ...custom.filter((x) => !SOURCE_SUGGESTIONS().includes(x))];
  const { chip, detail } = splitSource(value, chips);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((s) => setCustom(s ? (JSON.parse(s) as string[]) : []))
      .catch(() => {});
  }, []);

  const addCustom = () => {
    const name = draft.trim().slice(0, 12);
    setAdding(false);
    setDraft('');
    if (!name) return;
    const next = [name, ...custom.filter((x) => x !== name)].slice(0, 8);
    setCustom(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
    onChange(joinSource(name, detail));
  };

  return (
    <View style={{ gap: Spacing.sm }}>
      <AppText variant="label">
        {tr('在哪看到')} <AppText variant="caption" muted>{tr('· 選填')}</AppText>
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
        {chips.map((s) => (
          <Chip key={s} label={s} selected={chip === s} onPress={() => onChange(chip === s ? detail : joinSource(s, detail))} />
        ))}
        {adding ? (
          <TextInput
            autoFocus
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={addCustom}
            onBlur={addCustom}
            maxLength={12}
            placeholder={tr('例如：電子報')}
            placeholderTextColor={c.textTertiary}
            accessibilityLabel={tr('自己新增在哪看到')}
            style={[styles.addInput, { borderColor: c.primary, color: c.text, backgroundColor: c.surface }]}
          />
        ) : (
          <Chip label={tr('＋ 自己新增')} onPress={() => setAdding(true)} />
        )}
      </ScrollView>
      {chip || detail ? (
        <TextInput
          value={detail}
          onChangeText={(t) => onChange(joinSource(chip, t))}
          maxLength={40}
          placeholder={tr('補一句，例如：@小令的書單 的貼文')}
          placeholderTextColor={c.textTertiary}
          accessibilityLabel={tr('補一句在哪看到')}
          style={[styles.detail, { borderBottomColor: c.border, color: c.text }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6, paddingRight: Spacing.xl },
  addInput: { minWidth: 110, height: 36, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, fontSize: 14 },
  detail: { borderBottomWidth: 1, paddingVertical: 8, paddingHorizontal: 2, fontSize: 15 },
});
