import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Platform, Pressable } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LoginGate } from '@/components/login-gate';
import { OfflineBanner } from '@/components/offline-banner';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { usePushNotifications } from '@/lib/push';
import { loadAppearance } from '@/lib/appearance';
import { loadLanguage, localeTag, tr, useLang } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();
const prefsLoaded = Promise.all([loadAppearance(), loadLanguage()]);

const WELCOME_SEEN = 'bookhaus.welcome-seen';

function BackButton({ color }: { color: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={tr('返回')} hitSlop={8} onPress={() => router.back()} style={{ width: 36, height: 44, justifyContent: 'center' }}>
      <Ionicons name="chevron-back" size={28} color={color} />
    </Pressable>
  );
}

function RootStack() {
  const { isLoading, session } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  usePushNotifications(session?.user.id);
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const lang = useLang();
  const uid = session?.user.id;

  // 推播用的語言跟著 App 設定走
  useEffect(() => {
    if (!uid) return;
    supabase.from('profiles').update({ locale: localeTag(lang) }).eq('id', uid).then(() => {}, () => {});
  }, [uid, lang]);

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
      <Stack
        key={lang}
        screenOptions={({ navigation }) => ({
          headerBackButtonDisplayMode: 'minimal',
          headerTintColor: c.text,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
          // 返回：只有箭頭、沒有外框（iOS 26 預設會包一顆玻璃膠囊）
          ...(navigation.canGoBack()
            ? Platform.OS === 'ios'
              ? { unstable_headerLeftItems: () => [{ type: 'custom' as const, element: <BackButton color={c.text} />, hidesSharedBackground: true }] }
              : { headerLeft: () => <BackButton color={c.text} /> }
            : null),
        })}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="open-store/index" options={{ title: tr('開一間書店') }} />
        <Stack.Screen name="open-store/curation" options={{ title: tr('開店') }} />
        <Stack.Screen name="open-store/shelf" options={{ title: tr('開店') }} />
        <Stack.Screen name="open-store/done" options={{ title: '' }} />
        <Stack.Screen name="open-store/reasons" options={{ title: tr('推薦理由') }} />
        <Stack.Screen name="curation/[id]" options={{ title: tr('策展') }} />
        <Stack.Screen name="curation/preview/[id]" options={{ title: tr('預覽') }} />
        <Stack.Screen name="store/[slug]" options={{ title: '' }} />
        <Stack.Screen name="reading/[id]" options={{ title: '' }} />
        <Stack.Screen name="book/[id]" options={{ title: '' }} />
        <Stack.Screen name="reading/new" options={{ title: tr('記錄一本書') }} />
        <Stack.Screen name="reading/manage/[id]" options={{ title: tr('這本書') }} />
        <Stack.Screen name="reading/compose" options={{ title: tr('寫心得') }} />
        <Stack.Screen name="reading/note/[id]" options={{ title: tr('心得') }} />
        <Stack.Screen name="diary/compose" options={{ title: tr('記一筆') }} />
        <Stack.Screen name="diary/day/[date]" options={{ title: tr('日記') }} />
        <Stack.Screen name="diary/calendar" options={{ title: tr('日記月曆') }} />
        <Stack.Screen name="place/[id]" options={{ title: '' }} />
        <Stack.Screen name="store-edit" options={{ title: tr('編輯書店資料') }} />
        <Stack.Screen name="store-delete" options={{ title: tr('刪除書店') }} />
        <Stack.Screen name="report/[id]" options={{ title: tr('檢舉書店'), presentation: 'modal' }} />
        <Stack.Screen name="blocked" options={{ title: tr('已封鎖的帳號') }} />
        <Stack.Screen name="help" options={{ title: tr('說明與意見回饋') }} />
        <Stack.Screen name="admin" options={{ title: tr('審核後台') }} />
        <Stack.Screen name="legal/[doc]" options={{ title: '', presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ title: tr('設定') }} />
      </Stack>
      <LoginGate />
      <OfflineBanner />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    prefsLoaded.finally(() => setReady(true));
  }, []);
  if (!ready) return null; // 啟動畫面還在
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RootStack />
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
