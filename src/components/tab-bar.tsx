import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { QuickAddSheet } from '@/components/quick-add';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { tr } from '@/lib/i18n';

export const ACCENT_YELLOW = '#F2B94F';

const ICONS: Record<string, [React.ComponentProps<typeof Ionicons>['name'], React.ComponentProps<typeof Ionicons>['name']]> = {
  index: ['compass', 'compass-outline'],
  diary: ['journal', 'journal-outline'],
  saved: ['library', 'library-outline'],
  'my-store': ['storefront', 'storefront-outline'],
};

/**
 * Y1 底部分頁（v1.7）：深色膠囊放 4 個分頁圖示（選中的有淺色底），右邊獨立的黃色＋。
 * v1.9 AL7：圖示下面加文字（只有圖示時新用戶要一個一個點才知道是什麼）。
 */
export function CapsuleTabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { requireAuth } = useAuth();
  const [open, setOpen] = useState(false);
  const dark = c.background === '#1F1B16';
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: c.background }]}>
      <View style={[styles.capsule, { backgroundColor: dark ? '#2A251F' : '#1F1B16', borderColor: dark ? '#3A332B' : '#34302B' }]} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = typeof options.title === 'string' ? options.title : route.name;
          const icon = ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const e = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigateToTab(route.key);
              }}
              style={[styles.item, focused && { backgroundColor: '#3A3632' }]}>
              <Ionicons name={focused ? icon[0] : icon[1]} size={21} color={focused ? '#FFFFFF' : '#B9B2A8'} />
              <Text numberOfLines={1} allowFontScaling={false} style={[styles.label, { color: focused ? '#FFFFFF' : '#B9B2A8', fontWeight: focused ? '700' : '500' }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('新增')}
        onPress={() =>
          requireAuth(() => {
            track('fab_opened');
            setOpen(true);
          })
        }
        style={({ pressed }) => [styles.fab, { opacity: pressed ? 0.85 : 1 }]}>
        <Ionicons name="add" size={32} color="#1F1B16" />
      </Pressable>
      <QuickAddSheet visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  capsule: {
    flex: 1,
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    shadowColor: '#140E08',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  item: { flex: 1, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', gap: 1 },
  label: { fontSize: 10.5, lineHeight: 13 },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: ACCENT_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#140E08',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
