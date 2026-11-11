/**
 * 閃退紀錄：JS 錯誤（含 preview／正式版會直接關掉 App 的那種）先存在手機上，
 * 下次打開 App 再寫進 Supabase `events`（name = app_error）。原生層的閃退抓不到。
 * 查：select created_at, platform, app_version, props from events where name = 'app_error' order by created_at desc limit 20;
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const KEY = 'bookhaus.last-crash';
let lastRoute = '';

export const setCrashRoute = (route: string) => {
  lastRoute = route;
};

type Report = { message: string; stack: string; fatal: boolean; route: string; at: string; source: string };

function toReport(error: unknown, fatal: boolean, source: string): Report {
  const e = error instanceof Error ? error : new Error(String(error));
  return {
    message: e.message.slice(0, 300),
    stack: (e.stack ?? '').split('\n').slice(0, 12).join('\n').slice(0, 1800),
    fatal,
    route: lastRoute,
    at: new Date().toISOString(),
    source,
  };
}

async function send(r: Report) {
  const { data } = await supabase.auth.getSession();
  await supabase.from('events').insert({
    name: 'app_error',
    props: r,
    user_id: data.session?.user.id ?? null,
    platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
    app_version: Constants.expoConfig?.version ?? null,
  });
}

/** 畫面錯誤（ErrorBoundary 接到的）：直接送出 */
export function reportError(error: unknown, source = 'boundary') {
  const r = toReport(error, false, source);
  void AsyncStorage.setItem(KEY, JSON.stringify(r)).catch(() => {});
  void send(r)
    .then(() => AsyncStorage.removeItem(KEY))
    .catch(() => {});
}

/** 在根元件呼叫一次：攔下會讓 App 關掉的 JS 錯誤，並把上次沒送出的紀錄補送 */
export function installCrashReporter() {
  const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void } };
  const eu = g.ErrorUtils;
  if (eu && Platform.OS !== 'web') {
    const prev = eu.getGlobalHandler();
    eu.setGlobalHandler((e, fatal) => {
      try {
        void AsyncStorage.setItem(KEY, JSON.stringify(toReport(e, !!fatal, 'global')));
      } catch {
        // 忽略
      }
      prev(e, fatal);
    });
  }
  void (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return;
      await send(JSON.parse(raw) as Report);
      await AsyncStorage.removeItem(KEY);
    } catch {
      // 下次再試
    }
  })();
}
