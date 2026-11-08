import { tr } from '@/lib/i18n';
/**
 * P5 分享連結：https://<網站>/s/<slug>
 * - 有裝 App：Universal Links／App Links 直接打開書店（見 src/app/+native-intent.tsx）
 * - 沒裝 App：網頁版唯讀書店頁（src/app/s/[slug]+api.ts，EAS Hosting）
 * 網站網址由 EXPO_PUBLIC_WEB_URL 設定（例如 https://book-house.expo.app；有自己的網域後改成 https://bookhaus.app）
 */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://bookhaus.app').replace(/\/+$/, '');

export const storeUrl = (slug: string) => `${WEB_URL}/s/${slug}`;

/** 畫面上顯示用：bookhaus.app/s/my-cosmos */
export const storeLinkLabel = (slug: string) => storeUrl(slug).replace(/^https?:\/\//, '');

export const shareStoreMessage = (name: string, slug: string) => tr('來逛逛「{name}」：{p1}', { name, p1: storeUrl(slug) });
