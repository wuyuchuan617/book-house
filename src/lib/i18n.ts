/**
 * 設定 › 語言：跟隨系統／繁體中文／English（存在本機）
 *
 * 文字直接用中文當 key：tr('探索')、tr('{n} 本書', { n })。英文翻譯在 i18n-en.ts，
 * 沒翻到的字會顯示中文（`npm run i18n:check` 會列出缺漏）。
 * 系統語言是英文時預設 English，其他一律繁體中文。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { EN } from '@/lib/i18n-en';

export type Lang = 'zh' | 'en';
export type LangPref = 'system' | Lang;
type Vars = Record<string, string | number | null | undefined>;

const KEY = 'bookhaus.language';

/**
 * 手機語言。expo-localization 是原生模組：還沒重新打包的舊版 App（dev／preview）沒有它，
 * 這時改用 JS 內建的 Intl，App 不會因此打不開。
 */
function deviceLanguageCode(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getLocales } = require('expo-localization') as typeof import('expo-localization');
    return getLocales()[0]?.languageCode ?? undefined;
  } catch {
    try {
      return Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0];
    } catch {
      return undefined;
    }
  }
}

export function systemLang(): Lang {
  return deviceLanguageCode() === 'en' ? 'en' : 'zh';
}

let pref: LangPref = 'system';
let lang: Lang = systemLang();
const listeners = new Set<() => void>();

function apply(p: LangPref) {
  pref = p;
  lang = p === 'system' ? systemLang() : p;
  listeners.forEach((l) => l());
}

/** App 啟動時呼叫一次（在畫面出現前） */
export async function loadLanguage() {
  try {
    const saved = (await AsyncStorage.getItem(KEY)) as LangPref | null;
    if (saved === 'zh' || saved === 'en' || saved === 'system') apply(saved);
  } catch {
    // 讀不到就跟隨系統
  }
}

export function setLanguage(p: LangPref) {
  apply(p);
  AsyncStorage.setItem(KEY, p).catch(() => {});
}

export const currentLang = () => lang;
/** 存到 profiles.locale，給推播用 */
export const localeTag = (l: Lang = lang) => (l === 'en' ? 'en' : 'zh-Hant');

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
export const useLanguagePref = () => useSyncExternalStore(subscribe, () => pref, () => 'system' as LangPref);
export const useLang = () => useSyncExternalStore(subscribe, () => lang, () => 'zh' as Lang);

function fill(s: string, vars?: Vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m));
}

/** 翻譯：key 是繁體中文原文 */
export function tr(zh: string, vars?: Vars): string {
  if (lang === 'zh') return fill(zh, vars);
  const en = EN[zh];
  if (en === undefined) return fill(zh, vars);
  return typeof en === 'function' ? en(vars ?? {}) : fill(en, vars);
}

/** 這段文字是不是我們自己產生、已經翻好的訊息（給錯誤訊息判斷用） */
export function isAppText(message: string) {
  if (/[一-鿿]/.test(message)) return true;
  return lang === 'en' && KNOWN_EN().has(message);
}
let known: Set<string> | null = null;
const KNOWN_EN = () => (known ??= new Set(Object.values(EN).filter((v): v is string => typeof v === 'string')));

/** 英文複數：plural(n, 'book') → 'book' / 'books' */
export const plural = (n: unknown, one: string, many = one + 's') => (Number(n) === 1 ? one : many);

const TAG_EN: Record<string, string> = {
  nature: 'Nature & animals', life: 'Living', business: 'Business', science: 'Popular science',
  fiction: 'Fiction', essay: 'Essays', history: 'History', art: 'Art & design',
};
/** 固定主題標籤的顯示名稱（資料庫存中文，英文介面依 slug 換） */
export const tagLabel = (t: { slug: string; name: string }) => (lang === 'en' ? TAG_EN[t.slug] ?? t.name : t.name);
