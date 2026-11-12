/**
 * v1.8 AG 書旅：以城市整理書店，加上順路的咖啡、餐廳、景點；分天、排順序、每站一句推薦。
 * 伺服器還沒套用 v1.8 時，列表回空的。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Linking } from 'react-native';

import type { StoreColor } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { tr } from '@/lib/i18n';
import { rpcOr } from '@/lib/store-v16';
import { supabase } from '@/lib/supabase';

export type TripSlot = 'morning' | 'lunch' | 'afternoon' | 'evening';
export const TRIP_SLOTS: TripSlot[] = ['morning', 'lunch', 'afternoon', 'evening'];
export const SLOT_LABEL = (): Record<TripSlot, string> => ({ morning: tr('早上'), lunch: tr('午餐'), afternoon: tr('下午'), evening: tr('傍晚') });
export const daysLabel = (d: number) => (d === 0 ? tr('半天') : d === 1 ? tr('一天') : tr('{n} 天', { n: d }));

export type TripPlace = { id: string; name: string; address: string | null; lat: number | null; lng: number | null; category: string | null; google_place_id: string };
export type TripStop = { id: string; day: number; position: number; note: string | null; slot: TripSlot | null; place: TripPlace };
export type Trip = {
  id: string;
  city: string;
  title: string;
  intro: string | null;
  days: number;
  status: 'draft' | 'published';
  updated_at: string;
  is_mine: boolean;
  author: { name: string; slug: string | null; color: StoreColor | null; avatar_path: string | null };
  stop_count: number;
  bookstore_count: number;
  save_count: number;
  saved: boolean;
  stops?: TripStop[] | null;
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) => void qc.invalidateQueries({ queryKey: ['trips'] });

export function useTripCities() {
  return useQuery({ queryKey: ['trips', 'cities'], queryFn: () => rpcOr<{ city: string; n: number }[]>('trip_cities', {}, []) });
}

export function useExploreTrips(city: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['trips', 'explore', city, session?.user.id ?? 'anon'],
    queryFn: () => rpcOr<Trip[]>('explore_trips', { p_city: city, p_limit: 30 }, []),
  });
}

export function useTripDetail(id: string | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['trips', 'detail', id, session?.user.id ?? 'anon'],
    enabled: !!id,
    queryFn: () => rpcOr<Trip | null>('trip_detail', { p_id: id }, null),
  });
}

export function useMyTrips() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['trips', 'mine', session?.user.id],
    enabled: !!session,
    queryFn: () => rpcOr<{ mine: Trip[]; saved: Trip[] }>('my_trips', {}, { mine: [], saved: [] }),
  });
}

export function useStoreTrips(slug: string | undefined, enabled = true) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['trips', 'store', slug, session?.user.id ?? 'anon'],
    enabled: !!slug && enabled,
    queryFn: () => rpcOr<Trip[]>('store_trips', { p_slug: slug }, []),
  });
}

export function usePlaceTripCount(placeId: string | undefined) {
  return useQuery({ queryKey: ['trips', 'place', placeId], enabled: !!placeId, queryFn: () => rpcOr<number>('place_trip_count', { p_place_id: placeId }, 0) });
}

export type DraftStop = { place: TripPlace; day: number; note: string; slot: TripSlot | null };

export function useSaveTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string | null; city: string; title: string; intro: string; days: number; status: 'draft' | 'published'; stops: DraftStop[] }) => {
      const res = await supabase.rpc('save_trip', {
        p_id: v.id,
        p_city: v.city.trim(),
        p_title: v.title.trim(),
        p_intro: v.intro,
        p_days: v.days,
        p_status: v.status,
        p_stops: v.stops.map((s) => ({ place_id: s.place.id, day: s.day, note: s.note, slot: s.slot })),
      });
      if (res.error) throw new Error(res.error.message);
      const id = (res.data as { id: string }).id;
      if (!v.id) track('trip_created', {});
      if (v.status === 'published') track('trip_published', { stops: v.stops.length });
      return id;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase.from('trips').delete().eq('id', id);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useTripSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      const res = await supabase.rpc('trip_save', { p_trip_id: id, p_on: on });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: (_d, v) => {
      if (v.on) track('trip_saved', {});
      invalidate(qc);
    },
  });
}

export function useSaveTripPlaces() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase.rpc('save_trip_places', { p_trip_id: id });
      if (res.error) throw new Error(res.error.message);
      track('trip_places_saved', {});
      return (res.data as number) ?? 0;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['saved-places'] });
      void qc.invalidateQueries({ queryKey: ['place'] });
    },
  });
}

export function tripError(m: string) {
  if (m.includes('trip_private_place')) return tr('私人地點不能放進書旅。');
  if (m.includes('trip_needs_stops')) return tr('至少放一個地點才能公開。');
  if (/function|does not exist|schema cache/i.test(m)) return tr('伺服器還沒更新，稍後再試。');
  return tr('沒有成功，請稍後再試。');
}

/** 兩個地點的走路分鐘數（直線距離 × 1.3，每分鐘 80 公尺）；沒有座標回 null */
export function walkMinutes(a: TripPlace, b: TripPlace) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6371e3;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const m = 2 * R * Math.asin(Math.sqrt(h)) * 1.3;
  return Math.max(1, Math.round(m / 80));
}

export const walkLabel = (min: number) => (min > 40 ? tr('距離約 {km} 公里，建議搭車', { km: ((min * 80) / 1000).toFixed(1) }) : tr('走路 {n} 分鐘', { n: min }));

/** 地圖看全部：Google 地圖路線（照順序，最多 10 站） */
export function openTripMap(stops: TripStop[]) {
  const s = stops.slice(0, 10);
  if (!s.length) return;
  const q = (p: TripPlace) => encodeURIComponent(`${p.name} ${p.address ?? ''}`.trim());
  const origin = s[0].place;
  const dest = s[s.length - 1].place;
  const mid = s.slice(1, -1).map((x) => q(x.place)).join('%7C');
  const url = `https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=${q(origin)}&origin_place_id=${encodeURIComponent(origin.google_place_id)}&destination=${q(dest)}&destination_place_id=${encodeURIComponent(dest.google_place_id)}${mid ? `&waypoints=${mid}` : ''}`;
  void Linking.openURL(url);
}

/** 書店／咖啡／餐廳／景點的圖示與顏色 */
export function stopKind(category: string | null) {
  switch (category) {
    case 'bookstore':
    case 'indie':
      return { icon: 'book' as const, fg: '#8B4F37', bg: '#F3E7DF', label: tr('書店') };
    case 'library':
      return { icon: 'book-open' as const, fg: '#8B4F37', bg: '#F3E7DF', label: tr('圖書館') };
    case 'cafe':
      return { icon: 'coffee' as const, fg: '#9A4A12', bg: '#FBEBDD', label: tr('咖啡') };
    case 'park':
    case 'museum':
      return { icon: 'flag' as const, fg: '#2F5D6B', bg: '#E1ECEF', label: tr('景點') };
    default:
      return { icon: 'map-pin' as const, fg: '#5F574E', bg: '#EFE8DE', label: tr('地點') };
  }
}
