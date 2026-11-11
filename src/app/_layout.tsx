import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, usePathname, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
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
import { installCrashReporter, reportError, setCrashRoute } from '@/lib/crash';

SplashScreen.preventAutoHideAsync();
installCrashReporter();
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
  const pathname = usePathname();
  useEffect(() => setCrashRoute(pathname), [pathname]);
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
        <Stack.Screen name="diary/compose" options={{ title: tr('寫日記') }} />
        <Stack.Screen name="diary/day/[date]" options={{ title: tr('日記') }} />
        <Stack.Screen name="diary/calendar" options={{ title: tr('日記月曆') }} />
        <Stack.Screen name="place/[id]" options={{ title: '' }} />
        <Stack.Screen name="diary/week/[start]" options={{ title: tr('每週回顧') }} />
        <Stack.Screen name="diary/weeks" options={{ title: tr('每週回顧') }} />
        <Stack.Screen name="store-edit" options={{ title: tr('編輯書店資料') }} />
        <Stack.Screen name="store-delete" options={{ title: tr('重設書店') }} />
        <Stack.Screen name="store-visibility" options={{ title: tr('公開設定') }} />
        <Stack.Screen name="want-book" options={{ title: tr('想讀的書') }} />
        <Stack.Screen name="follows" options={{ title: '' }} />
        <Stack.Screen name="store-insights" options={{ title: tr('數據') }} />
        <Stack.Screen name="notifications" options={{ title: tr('通知') }} />
        <Stack.Screen name="search" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="purchase" options={{ title: tr('買了一本書') }} />
        <Stack.Screen name="purchases" options={{ title: tr('購書紀錄') }} />
        <Stack.Screen name="rx/new" options={{ title: tr('發起閱讀處方簽') }} />
        <Stack.Screen name="rx/[id]" options={{ title: tr('閱讀處方簽') }} />
        <Stack.Screen name="rx/reply" options={{ title: tr('開一張處方') }} />
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

/** 畫面出錯時不要直接關掉 App：顯示錯誤訊息（方便截圖回報）＋再試一次，並記到 events（app_error） */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error);
  }, [error]);
  return (
    <View style={{ flex: 1, backgroundColor: '#F3EFE8', padding: 24, paddingTop: 80, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: '#1F1B16' }}>{tr('出了點問題')}</Text>
      <Text style={{ fontSize: 15, color: '#5F574E', lineHeight: 22 }}>{tr('這個畫面沒有正常顯示。錯誤已經記錄下來，可以再試一次；如果一直發生，請截圖這頁回報。')}</Text>
      <ScrollView style={{ maxHeight: 240, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12 }}>
        <Text selectable style={{ fontSize: 12, color: '#1F1B16', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{`${error.message}\n\n${(error.stack ?? '').split('\n').slice(0, 8).join('\n')}`}</Text>
      </ScrollView>
      <Pressable accessibilityRole="button" onPress={retry} style={{ marginTop: 8, minHeight: 48, borderRadius: 12, backgroundColor: '#8B4F37', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>{tr('再試一次')}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#8B4F37', fontSize: 15, fontWeight: '600' }}>{tr('回到首頁')}</Text>
      </Pressable>
    </View>
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
