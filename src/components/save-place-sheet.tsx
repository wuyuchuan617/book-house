import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { TextField } from '@/components/form';
import { Dialog } from '@/components/sheet';
import { AppText, Button } from '@/components/ui';
import { MinTouch, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { categoryIcon, categoryLabel, diaryError, PLACE_NOTE_MAX, useSavePlace, type PlaceCategory } from '@/lib/diary';
import { tr } from '@/lib/i18n';

export type PlaceToSave = { id: string; name: string; address?: string | null; category: PlaceCategory; is_indie?: boolean; note?: string | null; my_indie_vote?: boolean };

/**
 * 存成想去：一句為什麼想去（選填）；書店可以勾「這是獨立書店」。
 * 已經存過時是「編輯」，可以移除。
 */
export function SavePlaceSheet({ place, saved, from, onClose, onSaved }: {
  place: PlaceToSave | null;
  saved?: boolean;
  from: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  return (
    <Dialog visible={!!place} onClose={onClose}>
      {place ? <Form key={place.id} place={place} saved={saved} from={from} onClose={onClose} onSaved={onSaved} /> : null}
    </Dialog>
  );
}

function Form({ place, saved, from, onClose, onSaved }: { place: PlaceToSave; saved?: boolean; from: string; onClose: () => void; onSaved?: () => void }) {
  const c = useTheme();
  const save = useSavePlace();
  const [note, setNote] = useState(place.note ?? '');
  const [indie, setIndie] = useState(!!place.my_indie_vote);
  const bookstore = place.category === 'bookstore';
  const fail = (e: Error) => Alert.alert(tr('沒有成功'), diaryError(e.message));

  return (
    <View style={{ gap: Spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
        <Feather name={categoryIcon(place.category)} size={20} color={c.primary} />
        <View style={{ flex: 1 }}>
          <AppText variant="heading" numberOfLines={2}>{place.name}</AppText>
          <AppText variant="caption" muted numberOfLines={1}>{[categoryLabel(place.category, place.is_indie), place.address].filter(Boolean).join(' · ')}</AppText>
        </View>
      </View>
      <TextField label={tr('為什麼想去？')} optional max={PLACE_NOTE_MAX} value={note} onChangeText={setNote} placeholder={tr('朋友推薦、想找某本書、二樓很安靜…')} />
      {bookstore && !place.my_indie_vote ? (
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: indie }} onPress={() => setIndie(!indie)} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: MinTouch }}>
          <Feather name={indie ? 'check-square' : 'square'} size={20} color={indie ? c.primary : c.textSecondary} />
          <View style={{ flex: 1 }}>
            <AppText variant="label">{tr('這是獨立書店')}</AppText>
            <AppText variant="caption" muted>{tr('2 個人以上標記，就會顯示成獨立書店。')}</AppText>
          </View>
        </Pressable>
      ) : null}
      <Button
        label={saved ? tr('儲存') : tr('存成想去')}
        loading={save.isPending}
        onPress={() =>
          save.mutate(
            { placeId: place.id, save: true, note, indie: bookstore && indie && !place.my_indie_vote, from },
            {
              onSuccess: () => {
                onClose();
                onSaved?.();
              },
              onError: fail,
            },
          )
        }
      />
      {saved ? (
        <Button
          kind="link"
          label={tr('從想去移除')}
          onPress={() => save.mutate({ placeId: place.id, save: false }, { onSuccess: onClose, onError: fail })}
        />
      ) : (
        <Button kind="link" label={tr('取消')} onPress={onClose} />
      )}
    </View>
  );
}
