import { Tabs } from 'expo-router';

import { CapsuleTabBar } from '@/components/tab-bar';
import { tr } from '@/lib/i18n';

/** 底部 4 個分頁：探索、日記、書櫃、我的書店（v1.7 Y1：深色膠囊＋右邊黃色＋） */
export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <CapsuleTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: tr('探索') }} />
      <Tabs.Screen name="diary" options={{ title: tr('日記') }} />
      <Tabs.Screen name="saved" options={{ title: tr('書櫃') }} />
      <Tabs.Screen name="my-store" options={{ title: tr('我的書店') }} />
    </Tabs>
  );
}
