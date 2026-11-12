import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/bottom-sheet';
import { Chip, chipRow, TextField } from '@/components/form';
import { PlacePicker } from '@/components/place-picker';
import { ActionSheet } from '@/components/sheet';
import { SortableList } from '@/components/sortable-list';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { categoryLabel, useMyPlaces } from '@/lib/diary';
import { tr } from '@/lib/i18n';
import { SLOT_LABEL, stopKind, TRIP_SLOTS, tripError, useSaveTrip, useTripDetail, type DraftStop, type Trip, type TripSlot } from '@/lib/trips';

const ROW_H = 64;
const DAY_OPTIONS = (): [number, string][] => [[0, tr('半天')], [1, tr('1 天')], [2, tr('2 天')], [3, tr('3 天＋')]];
const cityOf = (address: string | null) => (address?.match(/([一-龥]{1,3}[市縣])/)?.[1] ?? '').replace('臺', '台');

/**
 * AG3 整理一份書旅：名稱、城市（從第一個地點的地址自動帶）、天數；每天的地點可以排序、寫一句推薦、選時段。
 * 地點從想去／去過加，或搜尋；私人地點不能放。先存草稿，按「公開」才出現在探索。
 */
export default function TripEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useTripDetail(id);
  if (id && existing.isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  return <TripEditor key={existing.data?.id ?? 'new'} trip={existing.data ?? null} />;
}

function TripEditor({ trip }: { trip: Trip | null }) {
  const c = useTheme();
  const save = useSaveTrip();
  const [title, setTitle] = useState(trip?.title ?? '');
  const [city, setCity] = useState(trip?.city ?? '');
  const [intro, setIntro] = useState(trip?.intro ?? '');
  const [days, setDays] = useState(trip?.days ?? 1);
  const [day, setDay] = useState(1);
  const [stops, setStops] = useState<DraftStop[]>(() => (trip?.stops ?? []).map((s) => ({ place: s.place, day: s.day, note: s.note ?? '', slot: s.slot })));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mineOpen, setMineOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<DraftStop | null>(null);
  const [noteFor, setNoteFor] = useState<DraftStop | null>(null);
  const [done, setDone] = useState(false);

  const dayCount = Math.max(1, days, ...stops.map((s) => s.day));
  const shown = stops.filter((s) => s.day === day);
  const dirty = !trip
    ? !!(title.trim() || stops.length)
    : title !== trip.title || city !== trip.city || intro !== (trip.intro ?? '') || days !== trip.days ||
      JSON.stringify(stops.map((s) => [s.place.id, s.day, s.note, s.slot])) !== JSON.stringify((trip.stops ?? []).map((s) => [s.place.id, s.day, s.note ?? '', s.slot]));
  usePreventRemove(dirty && !done, ({ repeat }) => {
    Alert.alert(tr('放棄這次的修改？'), tr('還沒儲存的內容會不見。'), [
      { text: tr('繼續編輯'), style: 'cancel' },
      { text: tr('放棄'), style: 'destructive', onPress: repeat },
    ]);
  });

  const addPlace = (p: DraftStop['place']) => {
    if (stops.some((s) => s.place.id === p.id)) return Alert.alert(tr('已經在書旅裡了'));
    setStops((list) => [...list, { place: p, day, note: '', slot: null }]);
    if (!city.trim()) setCity(cityOf(p.address));
  };
  const update = (placeId: string, patch: Partial<DraftStop>) => setStops((list) => list.map((s) => (s.place.id === placeId ? { ...s, ...patch } : s)));
  const reorder = (keys: string[]) =>
    setStops((list) => {
      const others = list.filter((s) => s.day !== day);
      const today = keys.map((k) => list.find((s) => s.place.id === k)!).filter(Boolean);
      return [...others, ...today];
    });

  const canSave = !!title.trim() && !!city.trim();
  const submit = (status: 'draft' | 'published') =>
    save.mutate(
      { id: trip?.id ?? null, city, title, intro, days, status, stops: [...stops].sort((a, b) => a.day - b.day) },
      {
        onSuccess: (newId) => {
          setDone(true);
          setTimeout(() => router.replace({ pathname: '/trip/[id]', params: { id: newId } }), 0);
        },
        onError: (e) => Alert.alert(tr('沒有儲存成功'), tripError(e.message)),
      },
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: trip ? tr('編輯書旅') : tr('整理一份書旅') }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <TextField label={tr('書旅名稱')} max={40} value={title} onChangeText={setTitle} placeholder={tr('例如：老屋書店與巷弄咖啡')} />
          <TextField label={tr('城市')} max={40} value={city} onChangeText={setCity} placeholder={tr('加第一個地點會自動帶出來')} />
          <View style={{ gap: Spacing.sm }}>
            <AppText variant="label">{tr('天數')}</AppText>
            <View style={chipRow}>{DAY_OPTIONS().map(([d, label]) => <Chip key={d} label={label} selected={days === d} onPress={() => setDays(d)} />)}</View>
          </View>
          <TextField label={tr('一句介紹')} optional multiline max={300} value={intro} onChangeText={setIntro} placeholder={tr('適合誰、怎麼走、什麼季節去…')} />

          <View style={{ gap: Spacing.sm }}>
            {dayCount > 1 ? (
              <View style={chipRow}>{Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => <Chip key={d} label={tr('第 {n} 天', { n: d })} selected={day === d} onPress={() => setDay(d)} />)}</View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <AppText variant="label" style={{ flex: 1 }}>{dayCount > 1 ? tr('第 {n} 天的地點 · {m}', { n: day, m: shown.length }) : tr('地點 · {m}', { m: shown.length })}</AppText>
              {shown.length > 1 ? <AppText variant="caption" muted>{tr('按住 ≡ 拖拉排序')}</AppText> : null}
            </View>
            {shown.length ? (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <SortableList
                  items={shown}
                  keyOf={(s) => s.place.id}
                  rowHeight={ROW_H}
                  onReorder={reorder}
                  renderRow={(s, i) => {
                    const k = stopKind(s.place.category);
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={tr('第 {n} 站：{name}', { n: i + 1, name: s.place.name })}
                        onPress={() => setMenuFor(s)}
                        style={[styles.row, { height: ROW_H }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
                        <View style={[styles.icon, { backgroundColor: k.bg }]}><Feather name={k.icon} size={15} color={k.fg} /></View>
                        <View style={{ flex: 1 }}>
                          <AppText variant="label" numberOfLines={1}>{s.place.name}</AppText>
                          <AppText variant="caption" muted numberOfLines={1}>{s.note || [k.label, s.slot ? SLOT_LABEL()[s.slot] : null].filter(Boolean).join(' · ') || tr('點一下寫一句推薦')}</AppText>
                        </View>
                      </Pressable>
                    );
                  }}
                />
              </Card>
            ) : (
              <AppText variant="caption" muted>{tr('從想去、去過加地點，或搜尋。書店以外也可以加咖啡、餐廳、景點。')}</AppText>
            )}
            <View style={chipRow}>
              <Chip label={tr('＋ 從想去／去過加')} selected onPress={() => setMineOpen(true)} />
              <Chip label={tr('＋ 搜尋地點')} onPress={() => setPickerOpen(true)} />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Button kind="secondary" label={tr('存草稿')} style={{ flex: 1 }} disabled={!canSave} loading={save.isPending && save.variables?.status === 'draft'} onPress={() => submit('draft')} />
        <Button label={trip?.status === 'published' ? tr('儲存並更新') : tr('公開書旅')} style={{ flex: 2 }} disabled={!canSave || stops.length === 0} loading={save.isPending && save.variables?.status === 'published'} onPress={() => submit('published')} />
      </SafeAreaView>

      <PlacePicker
        visible={pickerOpen}
        googleOnly
        title={tr('加一個地點')}
        onClose={() => setPickerOpen(false)}
        onPick={(ch) => {
          setPickerOpen(false);
          if (ch.kind !== 'google') return;
          if (!ch.place.public_ok) return Alert.alert(tr('私人地點不能放進書旅'));
          addPlace({ id: ch.place.id, name: ch.place.name, address: ch.place.address, lat: null, lng: null, category: ch.place.category, google_place_id: ch.place.google_place_id });
        }}
      />
      <MyPlacesSheet visible={mineOpen} pickedIds={new Set(stops.map((s) => s.place.id))} onClose={() => setMineOpen(false)} onPick={(p) => addPlace(p)} />
      <ActionSheet
        visible={!!menuFor}
        title={menuFor?.place.name}
        onClose={() => setMenuFor(null)}
        actions={
          menuFor
            ? [
                { label: tr('寫一句推薦、選時段'), icon: 'edit-2' as const, onPress: () => setNoteFor(menuFor) },
                ...Array.from({ length: Math.max(days, 1) }, (_, i) => i + 1)
                  .filter((d) => d !== menuFor.day)
                  .map((d) => ({ label: tr('移到第 {n} 天', { n: d }), icon: 'corner-down-right' as const, onPress: () => update(menuFor.place.id, { day: d }) })),
                { label: tr('從書旅移除'), destructive: true, onPress: () => setStops((list) => list.filter((s) => s.place.id !== menuFor.place.id)) },
              ]
            : []
        }
      />
      <NoteSheet stop={noteFor} onClose={() => setNoteFor(null)} onSave={(note, slot) => noteFor && update(noteFor.place.id, { note, slot })} />
    </Screen>
  );
}

function NoteSheet({ stop, onClose, onSave }: { stop: DraftStop | null; onClose: () => void; onSave: (note: string, slot: TripSlot | null) => void }) {
  const [note, setNote] = useState<string | null>(null);
  const [slot, setSlot] = useState<TripSlot | null | undefined>(undefined);
  const value = note ?? stop?.note ?? '';
  const slotValue = slot === undefined ? stop?.slot ?? null : slot;
  const close = () => {
    setNote(null);
    setSlot(undefined);
    onClose();
  };
  return (
    <BottomSheet visible={!!stop} onClose={close} style={{ paddingHorizontal: Spacing.xl, gap: Spacing.md }}>
      <AppText variant="heading">{stop?.place.name}</AppText>
      <TextField label={tr('一句推薦')} optional multiline max={120} value={value} onChangeText={setNote} placeholder={tr('為什麼值得去、要點什麼、幾點去比較好…')} />
      <View style={chipRow}>{TRIP_SLOTS.map((s) => <Chip key={s} label={SLOT_LABEL()[s]} selected={slotValue === s} onPress={() => setSlot(slotValue === s ? null : s)} />)}</View>
      <Button label={tr('好了')} onPress={() => { onSave(value.trim(), slotValue); close(); }} />
    </BottomSheet>
  );
}

function MyPlacesSheet({ visible, pickedIds, onClose, onPick }: { visible: boolean; pickedIds: Set<string>; onClose: () => void; onPick: (p: DraftStop['place']) => void }) {
  const c = useTheme();
  const want = useMyPlaces('want');
  const visited = useMyPlaces('visited');
  const all = [...(want.data ?? []), ...(visited.data ?? []).filter((v) => !(want.data ?? []).some((w) => w.id === v.id))];
  return (
    <BottomSheet visible={visible} onClose={onClose} style={{ paddingHorizontal: Spacing.xl, gap: Spacing.sm, maxHeight: '80%' }}>
      <AppText variant="heading">{tr('從想去／去過加')}</AppText>
      <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: Spacing.sm }}>
        {all.length === 0 ? <AppText muted>{tr('還沒有想去或去過的地點。')}</AppText> : null}
        {all.map((p) => {
          const on = pickedIds.has(p.id);
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityState={{ disabled: on }}
              disabled={on}
              onPress={() => onPick({ id: p.id, name: p.name, address: p.address, lat: null, lng: null, category: p.is_indie ? 'indie' : p.category, google_place_id: '' })}
              style={[styles.mine, { backgroundColor: c.surface, opacity: on ? 0.5 : 1 }]}>
              <View style={{ flex: 1 }}>
                <AppText variant="label">{p.name}</AppText>
                <AppText variant="caption" muted numberOfLines={1}>{[categoryLabel(p.category, p.is_indie), p.saved ? tr('想去') : tr('去過')].filter(Boolean).join(' · ')}</AppText>
              </View>
              <Feather name={on ? 'check' : 'plus'} size={18} color={on ? c.success : c.primary} />
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingLeft: Spacing.lg },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  mine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.md },
  footer: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
