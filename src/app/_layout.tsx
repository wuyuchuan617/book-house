import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';

import { LoginGate } from '@/components/login-gate';
import { OfflineBanner } from '@/components/offline-banner';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { usePushNotifications } from '@/lib/push';
import { loadAppearance } from '@/lib/appearance';

SplashScreen.preventAutoHideAsync();
void loadAppearance();

const WELCOME_SEEN = 'bookhaus.welcome-seen';

function RootStack() {
  const { isLoading, session } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  usePushNotifications(session?.user.id);
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;

  useEffect(() => {
    if (isLoading) return;
    SplashScreen.hideAsync();
    // 第一次打開 App 且未登入：顯示 A1 歡迎頁一次（可「先逛逛」）
    if (!session) {
      AsyncStorage.getItem(WELCOME_SEEN)
        .then((seen) => {
          if (!seen) {
            void AsyncStorage.setItem(WELCOME_SEEN, '1');
            router.push('/sign-in');
          }
        })
        .catch(() => {});
    }
  }, [isLoading, session]);

  return (
    <ThemeProvider
      value={{
        ...base,
        colors: { ...base.colors, background: c.background, card: c.surface, text: c.text, primary: c.primary, border: c.border },
      }}>
      <Stack screenOptions={{ headerBackTitle: '返回', headerTintColor: c.text, headerStyle: { backgroundColor: c.background } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="open-store/index" options={{ title: '開一間書店' }} />
        <Stack.Screen name="open-store/curation" options={{ title: '開店' }} />
        <Stack.Screen name="open-store/shelf" options={{ title: '開店' }} />
        <Stack.Screen name="open-store/done" options={{ title: '' }} />
        <Stack.Screen name="open-store/reasons" options={{ title: '推薦理由' }} />
        <Stack.Screen name="curation/[id]" options={{ title: '策展' }} />
        <Stack.Screen name="curation/preview/[id]" options={{ title: '預覽' }} />
        <Stack.Screen name="store/[slug]" options={{ title: '' }} />
        <Stack.Screen name="reading/[id]" options={{ title: '' }} />
        <Stack.Screen name="book/[id]" options={{ title: '' }} />
        <Stack.Screen name="reading/new" options={{ title: '記錄一本書' }} />
        <Stack.Screen name="reading/manage/[id]" options={{ title: '店主閱讀' }} />
        <Stack.Screen name="store-edit" options={{ title: '編輯書店資料' }} />
        <Stack.Screen name="store-delete" options={{ title: '刪除書店' }} />
        <Stack.Screen name="report/[id]" options={{ title: '檢舉書店', presentation: 'modal' }} />
        <Stack.Screen name="blocked" options={{ title: '已封鎖的帳號' }} />
        <Stack.Screen name="help" options={{ title: '說明與意見回饋' }} />
        <Stack.Screen name="admin" options={{ title: '審核後台' }} />
        <Stack.Screen name="legal/[doc]" options={{ title: '', presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ title: '設定' }} />
      </Stack>
      <LoginGate />
      <OfflineBanner />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }));
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RootStack />
      </AuthProvider>
    </QueryClientProvider>
  );
}
