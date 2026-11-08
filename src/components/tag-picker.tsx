import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Chip, chipRow, TextField } from '@/components/form';
import { AppText, Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { friendlyError, useCreateCustomTag, useTags } from '@/lib/curations';

const MAX_TAGS = 3;

/** C1 主題標籤：最多 3 個。第一版只開放固定標籤（PRD；自訂標籤會公開，需審核機制，V2 再開） */
const ALLOW_CUSTOM = false;

export function TagPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { data: tags } = useTags(selected);
  const createTag = useCreateCustomTag();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const full = selected.length >= MAX_TAGS;

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((t) => t !== id) : full ? selected : [...selected, id]);

  const submit = () =>
    createTag.mutate(name, {
      onSuccess: (t) => {
        if (!selected.includes(t.id) && !full) onChange([...selected, t.id]);
        setName('');
        setAdding(false);
      },
      onError: (e) => Alert.alert('沒有新增成功', friendlyError(e.message)),
    });

  // 已選的排前面，讓自訂標籤看得到
  const ordered = [...(tags ?? [])].sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)));

  return (
    <View style={{ gap: Spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="label">主題標籤</AppText>
        <AppText variant="caption" muted>{`最多 ${MAX_TAGS} 個 · 讀者可在探索頁篩選`}</AppText>
      </View>
      <View style={chipRow}>
        {ordered.map((t) => (
          <Chip
            key={t.id}
            label={t.kind === 'custom' ? `#${t.name}` : t.name}
            selected={selected.includes(t.id)}
            disabled={full && !selected.includes(t.id)}
            onPress={() => toggle(t.id)}
          />
        ))}
        {ALLOW_CUSTOM && !adding ? <Chip label="＋ 自訂標籤" disabled={full} onPress={() => setAdding(true)} /> : null}
      </View>
      {adding ? (
        <View style={{ gap: Spacing.sm }}>
          <TextField label="自訂標籤" max={12} value={name} onChangeText={setName} autoFocus placeholder="例如：觀星新手" onSubmitEditing={submit} returnKeyType="done" />
          <View style={{ flexDirection: 'row', gap: Spacing.md }}>
            <Button kind="secondary" label="取消" onPress={() => { setAdding(false); setName(''); }} style={{ flex: 1 }} />
            <Button label="新增標籤" disabled={!name.trim()} loading={createTag.isPending} onPress={submit} style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
