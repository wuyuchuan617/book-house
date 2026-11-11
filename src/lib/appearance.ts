/** 設定 › 外觀：跟隨系統／淺色／深色（存在本機） */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Appearance, Platform } from 'react-native';

export type AppearancePref = 'system' | 'light' | 'dark';
const KEY = 'bookhaus.appearance';

let pref: AppearancePref = 'system';
const listeners = new Set<() => void>();

function apply(p: AppearancePref) {
  pref = p;
  if (Platform.OS !== 'web') Appearance.setColorScheme(p === 'system' ? 'unspecified' : p);
  listeners.forEach((l) => l());
}

/** App 啟動時呼叫一次 */
export async function loadAppearance() {
  try {
    const saved = (await AsyncStorage.getItem(KEY)) as AppearancePref | null;
    if (saved === 'light' || saved === 'dark') apply(saved);
  } catch {
    // 讀不到就跟隨系統
  }
}

export function setAppearance(p: AppearancePref) {
  apply(p);
  AsyncStorage.setItem(KEY, p).catch(() => {});
}

export function useAppearancePref() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => pref,
    () => 'system' as AppearancePref,
  );
}
