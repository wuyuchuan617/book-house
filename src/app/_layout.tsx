import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';

import { LoginGate } from '@/components/login-gate';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/lib/auth';

SplashScreen.preventAutoHideAsync();

const WELCOME_SEEN = 'bookhaus.welcome-seen';

function RootStack() {
  const { isLoading, session } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
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
        <Stack.Screen name="open-store" options={{ title: '開一間書店' }} />
        <Stack.Screen name="store/[slug]" options={{ title: '' }} />
        <Stack.Screen name="settings" options={{ title: '設定' }} />
      </Stack>
      <LoginGate />
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
