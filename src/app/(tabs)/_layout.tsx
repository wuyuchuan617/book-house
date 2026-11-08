import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { tr } from '@/lib/i18n';

/** 底部 4 個分頁：探索、日記、書櫃（想讀＋追蹤的書店＋地方）、我的書店（PRD 第 4 節） */
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
        name="diary"
        options={{ title: tr('日記'), tabBarIcon: ({ color, size }) => <Feather name="calendar" color={color as string} size={size} /> }}
      />
      <Tabs.Screen
        name="saved"
        options={{ title: tr('書櫃'), tabBarIcon: ({ color, size }) => <Feather name="book-open" color={color as string} size={size} /> }}
      />
      <Tabs.Screen
        name="my-store"
        options={{ title: tr('我的書店'), tabBarIcon: ({ color, size }) => <Feather name="home" color={color as string} size={size} /> }}
      />
    </Tabs>
  );
}
