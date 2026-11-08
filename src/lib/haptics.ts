/**
 * 輕微震動回饋。expo-haptics 是原生模組：還沒重新打包的舊版 App 沒有它，就安靜略過。
 */
type HapticsModule = typeof import('expo-haptics');
let mod: HapticsModule | null | undefined;

function load(): HapticsModule | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-haptics') as HapticsModule;
  } catch {
    mod = null;
  }
  return mod;
}

export function tick() {
  void load()?.selectionAsync().catch(() => {});
}
