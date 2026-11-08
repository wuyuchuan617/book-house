/**
 * 大概位置（只在要用時問、只拿一次、不儲存）：打卡搜尋時偏向附近、「書的地方」依距離排序。
 * expo-location 是原生模組：還沒重新打包的舊版 App 沒有它，就當作拿不到位置。
 */
import { Platform } from 'react-native';

type LocationModule = typeof import('expo-location');
let mod: LocationModule | null | undefined;

function load(): LocationModule | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-location') as LocationModule;
  } catch {
    mod = null;
  }
  return mod;
}

export type Coords = { lat: number; lng: number };
let cached: { at: number; coords: Coords } | null = null;

export const locationAvailable = () => Platform.OS !== 'web' && !!load();

/** 拿不到（沒權限、舊版 App、逾時）就回傳 null，不跳錯 */
export async function approximateLocation(opts: { ask?: boolean } = {}): Promise<Coords | null> {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.coords;
  const L = load();
  if (!L || Platform.OS === 'web') return null;
  try {
    let perm = await L.getForegroundPermissionsAsync();
    if (!perm.granted && opts.ask && perm.canAskAgain) perm = await L.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const last = await L.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
    const pos =
      last ??
      (await Promise.race([
        L.getCurrentPositionAsync({ accuracy: L.Accuracy.Low }),
        new Promise<null>((r) => setTimeout(() => r(null), 6000)),
      ]));
    if (!pos) return null;
    // 只留到小數 3 位（約 100 公尺），夠排序用
    const coords = { lat: Math.round(pos.coords.latitude * 1000) / 1000, lng: Math.round(pos.coords.longitude * 1000) / 1000 };
    cached = { at: Date.now(), coords };
    return coords;
  } catch {
    return null;
  }
}
