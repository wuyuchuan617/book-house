/**
 * P5 深層連結：把分享連結對應到 App 內的畫面
 *   https://<網站>/s/<slug>  → /store/<slug>
 *   bookhaus://s/<slug>      → /store/<slug>
 * 其他路徑照原樣交給 Expo Router（例如 bookhaus://store/<slug>、bookhaus://auth/callback）
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const url = new URL(path, 'bookhaus://app');
    const m = url.pathname.match(/^\/(?:--\/)?s\/([a-z0-9-]{3,30})\/?$/i);
    if (m) return `/store/${m[1].toLowerCase()}`;
    return path;
  } catch {
    return path;
  }
}
