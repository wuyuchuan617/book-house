/**
 * 掃描書頁取字：Google ML Kit 文字辨識（中文模型，含英文），全部在手機上完成、照片不上傳。
 * 原生模組：還沒重新打包的舊版 App 沒有它，scanAvailable() 會是 false，畫面就不顯示「掃描書頁」。
 */
import { NativeModules } from 'react-native';

type MLKit = typeof import('@react-native-ml-kit/text-recognition');
let mod: MLKit | null | undefined;

function load(): MLKit | null {
  if (mod !== undefined) return mod;
  try {
    if (!NativeModules.TextRecognition) {
      mod = null;
      return mod;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@react-native-ml-kit/text-recognition') as MLKit;
  } catch {
    mod = null;
  }
  return mod;
}

export const scanAvailable = () => !!load();

/** 依閱讀順序回傳辨識到的每一行（去掉空白行） */
export async function recognizeLines(uri: string): Promise<string[]> {
  const m = load();
  if (!m) return [];
  const result = await m.default.recognize(uri, m.TextRecognitionScript.CHINESE);
  return result.blocks
    .flatMap((b) => b.lines.map((l) => l.text.trim()))
    .filter((t) => t.length > 0);
}

/**
 * 把選到的幾行接成一段：中文行與行之間不加空白，英文單字之間補一個空白。
 */
export function joinLines(lines: string[]) {
  return lines.reduce((acc, line) => {
    if (!acc) return line;
    const needsSpace = /[A-Za-z0-9,.;:!?]$/.test(acc) && /^[A-Za-z0-9]/.test(line);
    return acc + (needsSpace ? ' ' : '') + line;
  }, '');
}
