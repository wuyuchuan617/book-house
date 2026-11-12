import { ActivityIndicator, View } from 'react-native';
import type { ReactNode } from 'react';

import { PlaceRow } from '@/components/diary';
import { Chip, chipRow } from '@/components/form';
import { AppText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useStoreJournal } from '@/lib/diary';
import { tr } from '@/lib/i18n';
import { taipeiDate } from '@/lib/period';

/** v1.7.3：分頁裡再切一次（想讀｜積讀、想去｜去過），跟書櫃 › 地點同一種小膠囊 */
export function SubChips<T extends string>({ options, value, onChange, right }: { options: [T, string][]; value: T; onChange: (v: T) => void; right?: ReactNode }) {
  if (options.length < 2) return right ? <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>{right}</View> : null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
      <View style={[chipRow, { flex: 1 }]} accessibilityRole="tablist">
        {options.map(([k, label]) => <Chip key={k} label={label} selected={value === k} onPress={() => onChange(k)} />)}
      </View>
      {right}
    </View>
  );
}

type Visited = { id: string; name: string; category: string | null; count: number; last: string };

/** 從手記的打卡整理出「去過」的地點（同一個地點合併、算次數）。讀者拿到的手記本來就只有公開的，所以只會有公開打卡的地點 */
export function useVisitedPlaces(bookstoreId: string | undefined) {
  const { data, isLoading } = useStoreJournal(bookstoreId);
  const map = new Map<string, Visited>();
  for (const it of data ?? []) {
    if (it.type !== 'post' || !it.place) continue;
    const v = map.get(it.place.id);
    if (v) {
      v.count += 1;
      if (it.entry_date > v.last) v.last = it.entry_date;
    } else map.set(it.place.id, { id: it.place.id, name: it.place.name, category: null, count: 1, last: it.entry_date });
  }
  return { places: [...map.values()].sort((a, b) => b.last.localeCompare(a.last)), isLoading };
}

/** 地點 › 去過：點了到地點頁 */
export function VisitedPlaces({ bookstoreId, mine }: { bookstoreId: string; mine?: boolean }) {
  const { places, isLoading } = useVisitedPlaces(bookstoreId);
  if (isLoading) return <ActivityIndicator style={{ marginTop: 32 }} />;
  if (!places.length)
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: mine ? 200 : 320, paddingHorizontal: Spacing.xl }}>
        <AppText variant="label">{mine ? tr('還沒有打卡過的地點') : tr('店主還沒有公開的打卡')}</AppText>
        <AppText variant="caption" muted style={{ textAlign: 'center' }}>{mine ? tr('在書店、圖書館打卡並設成公開，就會出現在這裡。') : tr('店主公開打卡之後會出現在這裡。')}</AppText>
      </View>
    );
  return (
    <View style={{ gap: Spacing.sm }}>
      {places.map((p) => (
        <PlaceRow key={p.id} place={{ id: p.id, name: p.name, address: null, category: p.category, photo_paths: [] }} meta={tr('去過 {n} 次 · 最近 {d}', { n: p.count, d: taipeiDate(`${p.last}T04:00:00Z`).md })} />
      ))}
    </View>
  );
}
