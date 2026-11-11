import { useColorScheme as useSystemScheme } from 'react-native';

import { useAppearancePref } from '@/lib/appearance';

/** 系統配色，若使用者在設定選了淺色／深色就用他選的 */
export function useColorScheme() {
  const system = useSystemScheme();
  const pref = useAppearancePref();
  return pref === 'system' ? system : pref;
}
