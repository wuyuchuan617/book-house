/**
 * v1.7.1 Z3：地點用哪個地圖打開。iOS 第一次問「Apple 地圖／Google 地圖」，選過就記住（存在本機），
 * 設定 › 地圖可以改回「每次問」。Android 與網頁只有 Google 地圖，直接打開。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Linking, Platform } from 'react-native';

import { track } from '@/lib/analytics';

export type MapsPref = 'ask' | 'apple' | 'google';
const KEY = 'bookhaus.maps';

let pref: MapsPref = 'ask';
const listeners = new Set<() => void>();
const set = (p: MapsPref) => {
  pref = p;
  listeners.forEach((l) => l());
};

/** App 啟動時呼叫一次 */
export async function loadMapsPref() {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved === 'apple' || saved === 'google') set(saved);
  } catch {
    // 讀不到就每次問
  }
}

export function setMapsPref(p: MapsPref) {
  set(p);
  AsyncStorage.setItem(KEY, p).catch(() => {});
}

export function useMapsPref() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => pref,
    () => 'ask' as MapsPref,
  );
}

/** 只有 iOS 有得選 */
export const canChooseMaps = Platform.OS === 'ios';

export type MapTarget = { name: string; address?: string | null; googlePlaceId?: string | null };

export function openMap(app: 'apple' | 'google', t: MapTarget) {
  const url =
    app === 'apple'
      ? `https://maps.apple.com/?q=${encodeURIComponent(t.name)}${t.address ? `&address=${encodeURIComponent(t.address)}` : ''}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.name)}${t.googlePlaceId ? `&query_place_id=${encodeURIComponent(t.googlePlaceId)}` : ''}`;
  track('place_maps_opened', { app });
  void Linking.openURL(url);
}

/** 依偏好打開；要問的話回 false，讓畫面開選單 */
export function openMapByPref(t: MapTarget): boolean {
  if (!canChooseMaps) {
    openMap('google', t);
    return true;
  }
  if (pref === 'ask') return false;
  openMap(pref, t);
  return true;
}
