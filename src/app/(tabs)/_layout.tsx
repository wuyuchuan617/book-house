import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';

/** 底部 3 個分頁：探索、收藏、我的書店（PRD 第 4 節） */
export default function TabLayout() {
  const c = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textTertiary,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        tabBarLabelStyle: { fontSize: 12 },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: tr('探索'), tabBarIcon: ({ color, size }) => <Feather name="search" color={color as string} size={size} /> }}
      />
      <Tabs.Screen
        name="saved"
        options={{ title: tr('收藏'), tabBarIcon: ({ color, size }) => <Feather name="bookmark" color={color as string} size={size} /> }}
      />
      <Tabs.Screen
        name="my-store"
        options={{ title: tr('我的書店'), tabBarIcon: ({ color, size }) => <Feather name="home" color={color as string} size={size} /> }}
      />
    </Tabs>
  );
}
