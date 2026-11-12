import { Platform, Share } from 'react-native';

import { track } from '@/lib/analytics';
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

/**
 * 打開系統分享面板。從選單（Modal）裡呼叫時要等選單收起來，
 * 否則 iOS 會因為還有一個畫面正在關閉而不顯示分享面板（之前「分享書店」沒反應的原因）。
 */
export function shareStore(name: string, slug: string, opts: { afterModal?: boolean } = {}) {
  const open = () => {
    track('share_link_copied', { channel: 'system' });
    const url = storeUrl(slug);
    void Share.share(Platform.OS === 'ios' ? { message: tr('來逛逛「{name}」', { name }), url } : { message: shareStoreMessage(name, slug) }).catch(() => {});
  };
  if (opts.afterModal) setTimeout(open, 450);
  else open();
}

/** 分享處方箋：App 連結（網頁版之後再做） */
export function shareRx(id: string, title: string, opts: { afterModal?: boolean } = {}) {
  const open = () => {
    track('rx_shared', { channel: 'system' });
    const url = `bookhaus://rx/${id}`;
    const message = tr('幫我開一本書：「{title}」 在書棲打開：{url}', { title, url });
    void Share.share(Platform.OS === 'ios' ? { message, url } : { message }).catch(() => {});
  };
  if (opts.afterModal) setTimeout(open, 450);
  else open();
}
