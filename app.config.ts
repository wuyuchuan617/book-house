/**
 * 依 APP_VARIANT 產生三個可以同時裝在手機上的版本（bundle ID／名稱不同）：
 *   development → 書棲 Dev      com.bookhaus.app.dev
 *   preview     → 書棲 Preview  com.bookhaus.app.preview
 *   （未設定）   → 書棲 Bookhaus com.bookhaus.app（正式版）
 * APP_VARIANT 由 eas.json 各 build profile 的 env 設定。其他設定都在 app.json。
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

const VARIANTS = {
  development: { name: '書棲 Dev', suffix: '.dev' },
  preview: { name: '書棲 Preview', suffix: '.preview' },
} as const;

export default ({ config }: ConfigContext): ExpoConfig => {
  const v = VARIANTS[process.env.APP_VARIANT as keyof typeof VARIANTS];
  if (!v) return config as ExpoConfig;
  return {
    ...config,
    name: v.name,
    ios: { ...config.ios, bundleIdentifier: `${config.ios?.bundleIdentifier}${v.suffix}` },
    android: { ...config.android, package: `${config.android?.package}${v.suffix}` },
  } as ExpoConfig;
};
