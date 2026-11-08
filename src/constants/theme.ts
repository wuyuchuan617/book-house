/**
 * 書棲 Bookhaus design tokens — 對照 Design 畫布 S7「設計規範」。
 * 店面色都已確認白字對比 ≥ 4.5:1。
 */
import '@/global.css';

import { Platform } from 'react-native';
import { tr } from '@/lib/i18n';

export const Colors = {
  light: {
    text: '#1F1B16',
    textSecondary: '#5F574E',
    textTertiary: '#6B635A',
    background: '#F3EFE8',
    surface: '#FFFFFF',
    surfaceMuted: '#E8E0D4',
    border: '#DCD3C6',
    divider: '#EFE8DE',
    primary: '#8B4F37',
    onPrimary: '#FFFFFF',
    success: '#2F6B3A',
    successSurface: '#E3EEDD',
    danger: '#B42318',
    dangerSurface: '#FDE7E4',
  },
  dark: {
    text: '#F3EFE8',
    textSecondary: '#C9BCAB',
    textTertiary: '#B9A894',
    background: '#1F1B16',
    surface: '#2A251F',
    surfaceMuted: '#3A332B',
    border: '#4A4238',
    divider: '#3A332B',
    primary: '#D9997C',
    onPrimary: '#1F1B16',
    success: '#9FD39B',
    successSurface: '#24502C',
    danger: '#F2A39A',
    dangerSurface: '#5C1A14',
  },
} as const;

export type ThemeColors = { [K in keyof typeof Colors.light]: string };

/** 店面顏色（bookstores.color enum） */
export const StoreColors = {
  moss: { get label() { return tr('苔綠'); }, hex: '#667659' },
  mist: { get label() { return tr('霧藍'); }, hex: '#5E7594' },
  olive: { get label() { return tr('橄欖'); }, hex: '#857039' },
  wisteria: { get label() { return tr('紫藤'); }, hex: '#6E5A9E' },
  clay: { get label() { return tr('陶粉'); }, hex: '#9A6457' },
  ochre: { get label() { return tr('赭褐'); }, hex: '#8B4F37' },
} as const;

export type StoreColor = keyof typeof StoreColors;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif' },
  default: { sans: 'normal', serif: 'serif' },
  web: { sans: 'var(--font-display)', serif: 'var(--font-serif)' },
});

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;
export const Radius = { sm: 9, md: 12, lg: 14, xl: 16, pill: 999 } as const;

/** 觸控範圍下限（S7：≥ 44×44） */
export const MinTouch = 44;
